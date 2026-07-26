import { buildConfigFromParams, generateId } from './config.js';
import {
  claimTeacherAccess,
  clearBoardNotes,
  deleteBoard,
  deleteNoteFromBoard,
  fetchNotes,
  getBoardData,
  getBoardSettings,
  getTeacherKey,
  isCurrentUserBoardTeacher,
  saveNote,
  setBoardFrozen,
  subscribeToBoardSettings,
  subscribeToNotes,
} from './firebase-store.js';
import { enableBoardPan } from './board-pan.js';
import { enableUiVisibility } from './ui-visibility.js';

const DEFAULT_NOTE = { width: 180, height: 120, color: 'yellow' };
const COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange'];
const SYNC_INTERVAL_MS = 10000;

const configError = document.querySelector('#config-error');
const boardApp = document.querySelector('#board-app');
const board = document.querySelector('#board');
const emptyState = document.querySelector('#empty-state');
const noteTemplate = document.querySelector('#note-template');
const addNoteButton = document.querySelector('#add-note');
const refreshButton = document.querySelector('#refresh-board');
const clearBoardButton = document.querySelector('#clear-board');
const syncStatus = document.querySelector('#sync-status');
const noteCount = document.querySelector('#note-count');
const teacherLoginToggle = document.querySelector('#teacher-login-toggle');
const teacherPanel = document.querySelector('#teacher-panel');
const teacherLoginForm = document.querySelector('#teacher-login-form');
const teacherLoginPin = document.querySelector('#teacher-login-pin');
const teacherLoginStatus = document.querySelector('#teacher-login-status');
const teacherActions = document.querySelector('#teacher-actions');
const teacherStatus = document.querySelector('#teacher-status');
const teacherKeyValue = document.querySelector('#teacher-key-value');
const freezeBoard = document.querySelector('#freeze-board');
const downloadBoardButton = document.querySelector('#download-board');
const deleteBoardButton = document.querySelector('#delete-board');

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
  refreshButton.addEventListener('click', () => refreshNotesFromFirebase({ manual: true }));
  clearBoardButton.addEventListener('click', clearBoard);
  teacherLoginToggle.addEventListener('click', () => teacherPanel.classList.toggle('hidden'));
  teacherLoginForm.addEventListener('submit', signInAsTeacher);
  freezeBoard.addEventListener('change', updateFrozenState);
  downloadBoardButton.addEventListener('click', downloadBoardData);
  deleteBoardButton.addEventListener('click', removeBoard);
  syncFromFirebase();
  subscribeToBoardSettings(config.boardId, applyBoardSettings, handleBoardSettingsError);
  periodicSyncTimer = window.setInterval(refreshNotesFromFirebase, SYNC_INTERVAL_MS);
  window.addEventListener('beforeunload', () => {
    unsubscribeFromNotes?.();
    window.clearInterval(periodicSyncTimer);
  });
}

async function applyBoardSettings(settings) {
  boardSettings = settings;
  isTeacher = await isCurrentUserBoardTeacher(config.boardId);
  freezeBoard.checked = Boolean(settings?.frozen);
  teacherActions.classList.toggle('hidden', !isTeacher);
  teacherLoginForm.classList.toggle('hidden', isTeacher);
  clearBoardButton.classList.toggle('hidden', !isTeacher);

  if (!settings?.created_at) {
    teacherLoginStatus.textContent = '這張白板尚未設定老師密鑰。';
  } else if (isTeacher) {
    teacherLoginStatus.textContent = '';
    teacherStatus.textContent = settings.frozen ? '學生編輯已凍結。' : '學生目前可以編輯。';
    teacherKeyValue.textContent = await getTeacherKey(config.boardId) || '讀取中…';
  }

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
    teacherStatus.textContent = freezeBoard.checked ? '學生編輯已凍結。' : '學生目前可以編輯。';
  } catch (error) {
    console.error(error);
    freezeBoard.checked = Boolean(boardSettings?.frozen);
    teacherStatus.textContent = '無法更新凍結狀態，請稍後再試。';
  } finally {
    freezeBoard.disabled = false;
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
  edit.addEventListener('click', () => startEditing(noteId));
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
  editor.addEventListener('blur', () => finishEditing(noteId));

  return element;
}

function canEditBoard() {
  return Boolean(boardSettings?.created_at) && (!boardSettings.frozen || isTeacher);
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
}

function startEditing(noteId) {
  if (!canEditBoard()) return;
  const note = notes.get(noteId);
  if (!note) return;

  editingNotes.add(noteId);
  note.element.classList.add('is-editing');
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
