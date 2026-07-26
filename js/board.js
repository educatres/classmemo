import { buildBoardUrl, buildConfigFromParams, generateId } from './config.js';
import {
  BOARD_LIFETIME_MS,
  claimTeacherAccess,
  clearBoardNotes,
  deleteBoard,
  deleteNoteFromBoard,
  fetchNotes,
  getBoardData,
  getBoardSettings,
  getTeacherKey,
  isCurrentUserBoardTeacher,
  replaceBoardNotes,
  saveNote,
  setBoardFrozen,
  subscribeToBoardSettings,
  subscribeToNotes,
} from './firebase-store.js';
import { enableBoardPan } from './board-pan.js';
import { renderQr } from './qr.js';
import { enableUiVisibility } from './ui-visibility.js';

const DEFAULT_NOTE = { width: 180, height: 120, color: 'yellow' };
const COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange'];
const SYNC_INTERVAL_MS = 10000;
const EXPORT_PADDING = 56;
const EXPORT_MIN_SIZE = { width: 1700, height: 1100 };
const NOTE_COLORS = {
  yellow: '#ffe680',
  pink: '#ffc2d4',
  blue: '#addcff',
  green: '#bfe8b8',
  purple: '#d7c5ff',
  orange: '#ffc07a',
};

const configError = document.querySelector('#config-error');
const boardApp = document.querySelector('#board-app');
const board = document.querySelector('#board');
const emptyState = document.querySelector('#empty-state');
const noteTemplate = document.querySelector('#note-template');
const addNoteButton = document.querySelector('#add-note');
const clearBoardButton = document.querySelector('#clear-board');
const syncStatus = document.querySelector('#sync-status');
const noteCount = document.querySelector('#note-count');
const studentEditStatus = document.querySelector('#student-edit-status');
const teacherLoginToggle = document.querySelector('#teacher-login-toggle');
const teacherPanel = document.querySelector('#teacher-panel');
const teacherLoginForm = document.querySelector('#teacher-login-form');
const teacherLoginPin = document.querySelector('#teacher-login-pin');
const teacherLoginStatus = document.querySelector('#teacher-login-status');
const teacherActions = document.querySelector('#teacher-actions');
const teacherStatus = document.querySelector('#teacher-status');
const teacherKeyValue = document.querySelector('#teacher-key-value');
const toggleTeacherKeyButton = document.querySelector('#toggle-teacher-key');
const copyTeacherKeyButton = document.querySelector('#copy-teacher-key');
const boardExpiry = document.querySelector('#board-expiry');
const freezeBoard = document.querySelector('#freeze-board');
const importBoardButton = document.querySelector('#import-board');
const importBoardFile = document.querySelector('#import-board-file');
const showBoardQrButton = document.querySelector('#show-board-qr');
const downloadBoardButton = document.querySelector('#download-board');
const downloadBoardPngButton = document.querySelector('#download-board-png');
const downloadBoardSvgButton = document.querySelector('#download-board-svg');
const deleteBoardButton = document.querySelector('#delete-board');
const boardQrModal = document.querySelector('#board-qr-modal');
const closeBoardQrButton = document.querySelector('#close-board-qr');
const teacherQrCode = document.querySelector('#teacher-qr-code');
const teacherQrUrl = document.querySelector('#teacher-qr-url');

const parsed = buildConfigFromParams();
const notes = new Map();
const editingNotes = new Set();
let config;
let unsubscribeFromNotes;
let subscriptionStarted = false;
let periodicSyncTimer;
let isPolling = false;
let maxZIndex = 1;
let boardSettings = null;
let isTeacher = false;
let expiryTimer;
let isExpiryCleanupRunning = false;
let teacherKey = '';
let isTeacherKeyVisible = false;
let teacherStatusTimer;

if (!parsed.ok) {
  configError.classList.remove('hidden');
} else {
  config = parsed.config;
  boardApp.classList.remove('hidden');
  boot();
}

function boot() {
  enableBoardPan(board);
  enableUiVisibility(boardApp);
  addNoteButton.addEventListener('click', createNote);
  clearBoardButton.addEventListener('click', clearBoard);
  teacherLoginToggle.addEventListener('click', () => teacherPanel.classList.toggle('hidden'));
  teacherLoginForm.addEventListener('submit', signInAsTeacher);
  freezeBoard.addEventListener('change', updateFrozenState);
  toggleTeacherKeyButton.addEventListener('click', toggleTeacherKeyVisibility);
  copyTeacherKeyButton.addEventListener('click', copyTeacherKey);
  importBoardButton.addEventListener('click', () => importBoardFile.click());
  importBoardFile.addEventListener('change', importBoardData);
  showBoardQrButton.addEventListener('click', openBoardQrModal);
  downloadBoardButton.addEventListener('click', downloadBoardData);
  downloadBoardPngButton.addEventListener('click', () => downloadBoardImage('png'));
  downloadBoardSvgButton.addEventListener('click', () => downloadBoardImage('svg'));
  deleteBoardButton.addEventListener('click', removeBoard);
  closeBoardQrButton.addEventListener('click', closeBoardQrModal);
  boardQrModal.addEventListener('click', (event) => {
    if (event.target === boardQrModal) closeBoardQrModal();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeBoardQrModal();
  });
  syncFromFirebase();
  subscribeToBoardSettings(config.boardId, applyBoardSettings, handleBoardSettingsError);
  periodicSyncTimer = window.setInterval(refreshNotesFromFirebase, SYNC_INTERVAL_MS);
  expiryTimer = window.setInterval(updateBoardExpiry, 60000);
  window.addEventListener('beforeunload', () => {
    unsubscribeFromNotes?.();
    window.clearInterval(periodicSyncTimer);
    window.clearInterval(expiryTimer);
  });
}

async function applyBoardSettings(settings) {
  boardSettings = settings;
  isTeacher = await isCurrentUserBoardTeacher(config.boardId);
  freezeBoard.checked = Boolean(settings?.frozen);
  teacherActions.classList.toggle('hidden', !isTeacher);
  teacherLoginForm.classList.toggle('hidden', isTeacher);
  clearBoardButton.classList.toggle('hidden', !isTeacher);
  studentEditStatus.textContent = settings?.created_at
    ? `（${settings.frozen ? '學生不可編輯' : '學生可編輯'}）`
    : '';

  if (!settings?.created_at) {
    teacherLoginStatus.textContent = '這張白板尚未設定老師密鑰。';
  } else if (isTeacher) {
    teacherLoginStatus.textContent = '';
    teacherStatus.textContent = '';
    teacherKey = await getTeacherKey(config.boardId) || '';
    isTeacherKeyVisible = false;
    renderTeacherKey();
  }

  updateBoardExpiry();
  applyEditingState();
}

function handleBoardSettingsError(error) {
  console.error(error);
  teacherLoginStatus.textContent = '無法讀取老師控制設定。';
}

async function signInAsTeacher(event) {
  event.preventDefault();
  teacherLoginStatus.textContent = '正在登入老師控制台…';

  try {
    await claimTeacherAccess(config.boardId, teacherLoginPin.value);
    teacherLoginPin.value = '';
    boardSettings = await getBoardSettings(config.boardId);
    await applyBoardSettings(boardSettings);
  } catch (error) {
    console.error(error);
    teacherLoginStatus.textContent = '登入失敗，請確認六位數密鑰。';
  }
}

async function updateFrozenState() {
  if (!isTeacher) return;

  freezeBoard.disabled = true;
  try {
    await setBoardFrozen(config.boardId, freezeBoard.checked);
    teacherStatus.textContent = '已更新學生編輯權限。';
  } catch (error) {
    console.error(error);
    freezeBoard.checked = Boolean(boardSettings?.frozen);
    teacherStatus.textContent = '無法更新凍結狀態，請稍後再試。';
  } finally {
    freezeBoard.disabled = false;
  }
}

function renderTeacherKey() {
  teacherKeyValue.textContent = teacherKey
    ? (isTeacherKeyVisible ? teacherKey : '••••••')
    : '讀取中…';
  toggleTeacherKeyButton.textContent = isTeacherKeyVisible ? '隱藏' : '顯示';
  toggleTeacherKeyButton.setAttribute('aria-pressed', String(isTeacherKeyVisible));
  toggleTeacherKeyButton.disabled = !teacherKey;
  copyTeacherKeyButton.disabled = !teacherKey;
}

function toggleTeacherKeyVisibility() {
  if (!teacherKey) return;
  isTeacherKeyVisible = !isTeacherKeyVisible;
  renderTeacherKey();
}

async function copyTeacherKey() {
  if (!teacherKey) return;

  try {
    await navigator.clipboard.writeText(teacherKey);
    const copiedMessage = '已複製老師密鑰。';
    teacherStatus.textContent = copiedMessage;
    window.clearTimeout(teacherStatusTimer);
    teacherStatusTimer = window.setTimeout(() => {
      if (teacherStatus.textContent === copiedMessage) teacherStatus.textContent = '';
    }, 2500);
  } catch (error) {
    console.error(error);
    teacherStatus.textContent = '無法複製老師密鑰，請改用「顯示」查看。';
  }
}

async function downloadBoardData() {
  if (!isTeacher) return;

  try {
    const data = await getBoardData(config.boardId);
    const file = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${config.boardId}-data.json`;
    link.click();
    URL.revokeObjectURL(url);
    teacherStatus.textContent = '已下載本白板資料 JSON。';
  } catch (error) {
    console.error(error);
    teacherStatus.textContent = '資料下載失敗，請稍後再試。';
  }
}

async function downloadBoardImage(format) {
  if (!isTeacher) return;

  try {
    teacherStatus.textContent = `正在產生白板 ${format.toUpperCase()}…`;
    const exportData = createBoardExport();
    const fileName = `${config.boardId}-whiteboard`;

    if (format === 'svg') {
      downloadBlob(new Blob([exportData.svg], { type: 'image/svg+xml;charset=utf-8' }), `${fileName}.svg`);
    } else {
      downloadBlob(await createPngFromSvg(exportData), `${fileName}.png`);
    }

    teacherStatus.textContent = `已下載白板 ${format.toUpperCase()}。`;
  } catch (error) {
    console.error(error);
    teacherStatus.textContent = `白板 ${format.toUpperCase()} 下載失敗，請稍後再試。`;
  }
}

function createBoardExport() {
  const exportNotes = [...notes.values()].sort((first, second) => Number(first.z_index) - Number(second.z_index));
  const bounds = exportNotes.reduce((current, note) => ({
    left: Math.min(current.left, Number(note.x) || 0),
    top: Math.min(current.top, Number(note.y) || 0),
    right: Math.max(current.right, (Number(note.x) || 0) + (Number(note.width) || DEFAULT_NOTE.width)),
    bottom: Math.max(current.bottom, (Number(note.y) || 0) + (Number(note.height) || DEFAULT_NOTE.height)),
  }), { left: 0, top: 0, right: EXPORT_MIN_SIZE.width, bottom: EXPORT_MIN_SIZE.height });
  const left = Math.min(0, bounds.left - EXPORT_PADDING);
  const top = Math.min(0, bounds.top - EXPORT_PADDING);
  const width = Math.ceil(Math.max(EXPORT_MIN_SIZE.width, bounds.right - left + EXPORT_PADDING));
  const height = Math.ceil(Math.max(EXPORT_MIN_SIZE.height, bounds.bottom - top + EXPORT_PADDING));
  const noteMarkup = exportNotes.map((note) => renderExportNote(note, left, top)).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#dbe0dc" stroke-width="1" />
    </pattern>
    <filter id="note-shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="10" stdDeviation="8" flood-color="#342b1c" flood-opacity="0.2" />
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="#fffdf7" />
  <rect width="100%" height="100%" fill="url(#grid)" />
  ${noteMarkup}
</svg>`;

  return { svg, width, height };
}

function renderExportNote(note, left, top) {
  const width = Math.max(120, Number(note.width) || DEFAULT_NOTE.width);
  const height = Math.max(80, Number(note.height) || DEFAULT_NOTE.height);
  const x = Math.round((Number(note.x) || 0) - left);
  const y = Math.round((Number(note.y) || 0) - top);
  const noteText = editingNotes.has(note.note_id)
    ? note.element.querySelector('.note-editor').value
    : note.text || '';
  const lineLength = Math.max(5, Math.floor((width - 24) / 17));
  const lines = wrapExportText(noteText, lineLength);
  const lineMarkup = lines.map((line, index) => `<tspan x="12" dy="${index === 0 ? 0 : 26}">${escapeXml(line)}</tspan>`).join('');
  const color = NOTE_COLORS[note.color] || NOTE_COLORS.yellow;

  return `<g transform="translate(${x} ${y})" filter="url(#note-shadow)">
    <rect width="${width}" height="${height}" rx="5" fill="${color}" />
    <text x="12" y="34" fill="#27322c" font-family="Arial, 'Noto Sans TC', sans-serif" font-size="17" font-weight="700">${lineMarkup}</text>
  </g>`;
}

function wrapExportText(text, lineLength) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    if (!paragraph) {
      lines.push('');
      continue;
    }
    for (let index = 0; index < paragraph.length; index += lineLength) {
      lines.push(paragraph.slice(index, index + lineLength));
    }
  }
  return lines.length > 0 ? lines : [''];
}

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  })[character]);
}

async function createPngFromSvg({ svg, width, height }) {
  const maxSide = 4096;
  const scale = Math.min(2, maxSide / width, maxSide / height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(width * scale));
  canvas.height = Math.max(1, Math.floor(height * scale));
  const context = canvas.getContext('2d');
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  const image = new Image();

  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('SVG 轉換失敗'));
      image.src = svgUrl;
    });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('PNG 轉換失敗');
    return png;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function importBoardData() {
  if (!isTeacher) return;
  const [file] = importBoardFile.files;
  if (!file) return;

  try {
    const source = JSON.parse(await file.text());
    const notesToRestore = normalizeImportedNotes(source.notes);
    if (!window.confirm(`確定要以匯入資料取代目前白板的 ${notesToRestore.length} 張便條貼嗎？`)) return;

    await replaceBoardNotes(config.boardId, notesToRestore);
    teacherStatus.textContent = `已回復 ${notesToRestore.length} 張便條貼。`;
  } catch (error) {
    console.error(error);
    teacherStatus.textContent = '匯入失敗，請確認這是本白板匯出的 JSON 檔案。';
  } finally {
    importBoardFile.value = '';
  }
}

function openBoardQrModal() {
  if (!isTeacher) return;

  const boardUrl = buildBoardUrl({ board_id: config.boardId });
  teacherQrUrl.href = boardUrl;
  teacherQrUrl.textContent = boardUrl;
  renderQr(teacherQrCode, boardUrl);
  boardQrModal.classList.remove('hidden');
  closeBoardQrButton.focus();
}

function closeBoardQrModal() {
  if (boardQrModal.classList.contains('hidden')) return;
  boardQrModal.classList.add('hidden');
  showBoardQrButton.focus();
}

async function removeBoard() {
  if (!isTeacher) return;
  if (!window.confirm('確定要永久刪除這張白板與所有便條貼嗎？此操作無法復原。')) return;

  try {
    await deleteBoard(config.boardId);
    window.location.assign('./index.html');
  } catch (error) {
    console.error(error);
    teacherStatus.textContent = '刪除白板失敗，請稍後再試。';
  }
}

async function syncFromFirebase(options = {}) {
  if (subscriptionStarted) {
    setSyncStatus('即時同步已連線。');
    return;
  }

  setSyncStatus(options.manual ? '正在連線...' : '正在連線 Firebase...');
  subscriptionStarted = true;

  try {
    unsubscribeFromNotes = await subscribeToNotes(
      config.boardId,
      (remoteNotes) => {
        mergeRemoteNotes(remoteNotes);
        setSyncStatus(`即時同步中 · ${new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
      },
      (error) => {
        console.error(error);
        setSyncStatus('無法讀取 Firebase 資料，請稍後再試。', true);
      },
    );
  } catch (error) {
    console.error(error);
    subscriptionStarted = false;
    setSyncStatus(error.message || '無法連線 Firebase，請確認網路與匿名登入設定。', true);
  }
}

async function refreshNotesFromFirebase(options = {}) {
  if (isPolling) return;
  isPolling = true;

  try {
    const remoteNotes = await fetchNotes(config.boardId);
    mergeRemoteNotes(remoteNotes);
    const timestamp = new Date().toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setSyncStatus(options.manual ? `已手動同步 · ${timestamp}` : `每 10 秒同步 · ${timestamp}`);
  } catch (error) {
    console.error(error);
    setSyncStatus('無法讀取 Firebase 資料，請稍後再試。', true);
  } finally {
    isPolling = false;
  }
}

function mergeRemoteNotes(remoteNotes) {
  const remoteIds = new Set(remoteNotes.map((note) => note.note_id));

  for (const note of remoteNotes) {
    if (editingNotes.has(note.note_id)) continue;
    upsertNote(note);
  }

  for (const [noteId, note] of notes) {
    if (!remoteIds.has(noteId)) {
      note.element.remove();
      notes.delete(noteId);
    }
  }

  updateBoardMeta();
  applyEditingState();
}

async function createNote() {
  if (!canEditBoard()) return;
  const rect = board.getBoundingClientRect();
  const note = {
    note_id: generateId('note'),
    text: '雙擊編輯想法',
    x: Math.max(24, Math.round(board.scrollLeft + rect.width / 2 - DEFAULT_NOTE.width / 2)),
    y: Math.max(24, Math.round(board.scrollTop + rect.height / 2 - DEFAULT_NOTE.height / 2)),
    width: DEFAULT_NOTE.width,
    height: DEFAULT_NOTE.height,
    color: DEFAULT_NOTE.color,
    z_index: nextZIndex(),
  };

  upsertNote(note);
  startEditing(note.note_id);
  await submitNoteEvent(note.note_id, 'create');
}

function upsertNote(note) {
  const existing = notes.get(note.note_id);
  const element = existing?.element || createNoteElement(note.note_id);
  const state = {
    ...existing,
    ...note,
    element,
  };

  notes.set(note.note_id, state);
  maxZIndex = Math.max(maxZIndex, Number(state.z_index) || 1);
  renderNote(state);
  updateBoardMeta();
}

function createNoteElement(noteId) {
  const fragment = noteTemplate.content.cloneNode(true);
  const element = fragment.querySelector('.note');
  const text = element.querySelector('.note-text');
  const editor = element.querySelector('.note-editor');
  const color = element.querySelector('.note-color');
  const edit = element.querySelector('.edit-note');
  const remove = element.querySelector('.delete-note');
  const resizeHandle = element.querySelector('.resize-handle');

  element.dataset.noteId = noteId;
  board.append(element);

  element.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button, select, textarea, .resize-handle')) return;
    beginDrag(event, noteId);
  });
  resizeHandle.addEventListener('pointerdown', (event) => beginResize(event, noteId));
  text.addEventListener('dblclick', () => startEditing(noteId));
  text.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') startEditing(noteId);
  });
  edit.addEventListener('click', () => {
    if (editingNotes.has(noteId)) {
      finishEditing(noteId);
    } else {
      startEditing(noteId);
    }
  });
  remove.addEventListener('click', () => deleteNote(noteId));
  color.addEventListener('change', async () => {
    const note = notes.get(noteId);
    note.color = color.value;
    note.z_index = nextZIndex();
    renderNote(note);
    await submitNoteEvent(noteId, 'update');
  });
  editor.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      finishEditing(noteId);
    }
    if (event.key === 'Escape') {
      cancelEditing(noteId);
    }
  });
  return element;
}

function canEditBoard() {
  return Boolean(boardSettings?.created_at) && !isBoardExpired() && (!boardSettings.frozen || isTeacher);
}

function isBoardExpired() {
  return Number(boardSettings?.created_at) + BOARD_LIFETIME_MS <= Date.now();
}

function updateBoardExpiry() {
  if (!boardSettings?.created_at) return;

  const remaining = Number(boardSettings.created_at) + BOARD_LIFETIME_MS - Date.now();
  if (remaining <= 0) {
    if (isExpiryCleanupRunning) return;

    isExpiryCleanupRunning = true;
    boardExpiry.textContent = '白板已到期，正在自動清除資料…';
    applyEditingState();
    deleteBoard(config.boardId)
      .then(() => window.location.assign('./index.html'))
      .catch((error) => {
        console.error(error);
        isExpiryCleanupRunning = false;
        boardExpiry.textContent = '白板已到期，清除作業將在下次連線時重試。';
      });
    return;
  }

  boardExpiry.textContent = `距離失效：${formatRemainingTime(remaining)}`;
}

function formatRemainingTime(milliseconds) {
  const totalMinutes = Math.ceil(milliseconds / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return `${days} 天 ${hours} 小時 ${minutes} 分`;
}

function normalizeImportedNotes(rawNotes) {
  if (!rawNotes || typeof rawNotes !== 'object') {
    throw new Error('找不到便條貼資料');
  }

  const values = Array.isArray(rawNotes) ? rawNotes : Object.values(rawNotes);
  return values.map((note) => {
    if (!note || typeof note.note_id !== 'string' || !note.note_id) {
      throw new Error('便條貼格式不正確');
    }

    return {
      note_id: note.note_id,
      text: String(note.text || '').slice(0, 1000),
      x: Math.round(Number(note.x) || 0),
      y: Math.round(Number(note.y) || 0),
      width: clamp(Math.round(Number(note.width) || DEFAULT_NOTE.width), 120, 600),
      height: clamp(Math.round(Number(note.height) || DEFAULT_NOTE.height), 80, 400),
      color: COLORS.includes(note.color) ? note.color : 'yellow',
      z_index: Math.max(1, Math.round(Number(note.z_index) || 1)),
    };
  });
}

function applyEditingState() {
  const editable = canEditBoard();
  addNoteButton.disabled = !editable;
  addNoteButton.title = editable ? '' : '學生編輯目前已凍結，或此白板尚未設定老師密鑰。';

  for (const note of notes.values()) {
    note.element.classList.toggle('is-locked', !editable);
    note.element.querySelector('.note-color').disabled = !editable;
    note.element.querySelector('.edit-note').disabled = !editable;
    note.element.querySelector('.delete-note').disabled = !editable;
    note.element.querySelector('.note-editor').disabled = !editable;
    if (!editable) {
      editingNotes.delete(note.note_id);
      note.element.classList.remove('is-editing');
      setEditButtonMode(note.element, false);
    }
  }
}

function renderNote(note) {
  const element = note.element;
  const text = element.querySelector('.note-text');
  const editor = element.querySelector('.note-editor');
  const color = element.querySelector('.note-color');

  element.style.left = `${note.x}px`;
  element.style.top = `${note.y}px`;
  element.style.width = `${note.width}px`;
  element.style.height = `${note.height}px`;
  element.style.zIndex = note.z_index;
  element.dataset.color = COLORS.includes(note.color) ? note.color : 'yellow';
  text.textContent = note.text || '空白便條貼';
  editor.value = note.text || '';
  color.value = COLORS.includes(note.color) ? note.color : 'yellow';
  setEditButtonMode(element, false);
}

function startEditing(noteId) {
  if (!canEditBoard()) return;
  const note = notes.get(noteId);
  if (!note) return;

  editingNotes.add(noteId);
  note.element.classList.add('is-editing');
  setEditButtonMode(note.element, true);
  const editor = note.element.querySelector('.note-editor');
  editor.value = note.text || '';
  window.setTimeout(() => {
    editor.focus();
    editor.select();
  }, 0);
}

async function finishEditing(noteId) {
  if (!canEditBoard()) return;
  if (!editingNotes.has(noteId)) return;
  const note = notes.get(noteId);
  if (!note) return;

  const editor = note.element.querySelector('.note-editor');
  const nextText = editor.value.trim();
  editingNotes.delete(noteId);
  note.element.classList.remove('is-editing');
  setEditButtonMode(note.element, false);

  if (nextText !== note.text) {
    note.text = nextText;
    note.z_index = nextZIndex();
    renderNote(note);
    await submitNoteEvent(noteId, 'update');
  }
}

function cancelEditing(noteId) {
  if (!canEditBoard()) return;
  const note = notes.get(noteId);
  if (!note) return;
  editingNotes.delete(noteId);
  note.element.classList.remove('is-editing');
  renderNote(note);
}

function setEditButtonMode(element, isEditing) {
  const edit = element.querySelector('.edit-note');
  edit.textContent = isEditing ? '儲存' : '編輯';
  edit.setAttribute('aria-label', isEditing ? '儲存' : '編輯');
}

async function deleteNote(noteId) {
  if (!canEditBoard()) return;
  const note = notes.get(noteId);
  if (!note) return;
  if (!window.confirm('確定要刪除這張便條貼嗎？')) return;

  await submitDeletedEvent(note);
}

async function clearBoard() {
  if (!isTeacher) return;
  const visibleNotes = Array.from(notes.values());
  if (visibleNotes.length === 0) {
    setSyncStatus('目前沒有可清除的便條貼。');
    return;
  }

  if (!window.confirm(`確定要清除目前 ${visibleNotes.length} 張便條貼嗎？這會永久刪除 Firebase 中的資料。`)) return;

  try {
    setSyncStatus('正在清除 Firebase 資料...');
    await clearBoardNotes(config.boardId);
    setSyncStatus('已清除這張白板的所有便條貼。');
  } catch (error) {
    console.error(error);
    setSyncStatus('清除失敗，請稍後再試。', true);
  }
}

function beginDrag(event, noteId) {
  if (!canEditBoard()) return;
  const note = notes.get(noteId);
  if (!note) return;

  event.preventDefault();
  note.z_index = nextZIndex();
  renderNote(note);

  const start = {
    pointerId: event.pointerId,
    pointerX: event.clientX,
    pointerY: event.clientY,
    x: note.x,
    y: note.y,
  };

  note.element.setPointerCapture(event.pointerId);
  const move = (moveEvent) => {
    if (moveEvent.pointerId !== start.pointerId) return;
    note.x = Math.max(0, start.x + moveEvent.clientX - start.pointerX);
    note.y = Math.max(0, start.y + moveEvent.clientY - start.pointerY);
    renderNote(note);
  };
  const end = async (endEvent) => {
    if (endEvent.pointerId !== start.pointerId) return;
    note.element.removeEventListener('pointermove', move);
    note.element.removeEventListener('pointerup', end);
    note.element.removeEventListener('pointercancel', end);
    await submitNoteEvent(noteId, 'update');
  };

  note.element.addEventListener('pointermove', move);
  note.element.addEventListener('pointerup', end);
  note.element.addEventListener('pointercancel', end);
}

function beginResize(event, noteId) {
  if (!canEditBoard()) return;
  const note = notes.get(noteId);
  if (!note) return;

  event.preventDefault();
  event.stopPropagation();
  note.z_index = nextZIndex();
  renderNote(note);

  const start = {
    pointerId: event.pointerId,
    pointerX: event.clientX,
    pointerY: event.clientY,
    width: note.width,
    height: note.height,
  };

  note.element.setPointerCapture(event.pointerId);
  const move = (moveEvent) => {
    if (moveEvent.pointerId !== start.pointerId) return;
    note.width = clamp(start.width + moveEvent.clientX - start.pointerX, 120, 600);
    note.height = clamp(start.height + moveEvent.clientY - start.pointerY, 80, 400);
    renderNote(note);
  };
  const end = async (endEvent) => {
    if (endEvent.pointerId !== start.pointerId) return;
    note.element.removeEventListener('pointermove', move);
    note.element.removeEventListener('pointerup', end);
    note.element.removeEventListener('pointercancel', end);
    await submitNoteEvent(noteId, 'update');
  };

  note.element.addEventListener('pointermove', move);
  note.element.addEventListener('pointerup', end);
  note.element.addEventListener('pointercancel', end);
}

async function submitNoteEvent(noteId) {
  const note = notes.get(noteId);
  if (!note) return;

  try {
    await saveNote(config.boardId, note);
    setSyncStatus('已儲存並即時同步。');
  } catch (error) {
    console.error(error);
    setSyncStatus('已更新本機畫面，但 Firebase 儲存失敗。', true);
  }
}

async function submitDeletedEvent(note) {
  try {
    await deleteNoteFromBoard(config.boardId, note.note_id);
    note.element.remove();
    notes.delete(note.note_id);
    updateBoardMeta();
    setSyncStatus('已刪除並即時同步。');
  } catch (error) {
    console.error(error);
    setSyncStatus('本機已刪除，但 Firebase 儲存失敗。', true);
  }
}

function updateBoardMeta() {
  const count = notes.size;
  noteCount.textContent = `${count} 張`;
  emptyState.classList.toggle('hidden', count > 0);
}

function setSyncStatus(message, isError = false) {
  syncStatus.textContent = message;
  syncStatus.classList.toggle('is-error', isError);
}

function nextZIndex() {
  maxZIndex += 1;
  return maxZIndex;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
