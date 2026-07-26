import { generateId } from './config.js';
import { enableBoardPan } from './board-pan.js';
import { enableUiVisibility } from './ui-visibility.js';

const STORAGE_KEY = 'classmemo.demo.notes.v1';
const COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange'];
const STARTER_NOTES = [
  {
    note_id: 'demo_note_1',
    text: '歡迎試玩！雙擊文字可以編輯。',
    x: 72,
    y: 86,
    width: 230,
    height: 138,
    color: 'yellow',
    z_index: 2,
  },
  {
    note_id: 'demo_note_2',
    text: '拖曳便條貼，或拉右下角調整大小。',
    x: 340,
    y: 148,
    width: 245,
    height: 132,
    color: 'green',
    z_index: 3,
  },
  {
    note_id: 'demo_note_3',
    text: '正式使用時，資料會儲存在 Firebase，並即時同步給全班。',
    x: 160,
    y: 330,
    width: 300,
    height: 150,
    color: 'blue',
    z_index: 4,
  },
];

const board = document.querySelector('#board');
const emptyState = document.querySelector('#empty-state');
const noteTemplate = document.querySelector('#note-template');
const addNoteButton = document.querySelector('#add-note');
const resetDemoButton = document.querySelector('#reset-demo');
const clearBoardButton = document.querySelector('#clear-board');
const syncStatus = document.querySelector('#sync-status');
const noteCount = document.querySelector('#note-count');

const notes = new Map();
const hiddenNotes = new Map();
const editingNotes = new Set();
let maxZIndex = 1;

boot();

function boot() {
  enableBoardPan(board);
  enableUiVisibility(document);
  addNoteButton.addEventListener('click', createNote);
  resetDemoButton.addEventListener('click', resetDemo);
  clearBoardButton.addEventListener('click', clearBoard);

  const saved = loadNotes();
  const initialNotes = saved.length > 0 ? saved : STARTER_NOTES;
  initialNotes.forEach((note) => {
    if (note.visible === false) {
      hiddenNotes.set(note.note_id, { ...note, visible: false });
      return;
    }

    upsertNote({ ...note, visible: true });
  });
  persist();
  updateBoardMeta();
}

function createNote() {
  const rect = board.getBoundingClientRect();
  const note = {
    note_id: generateId('demo_note'),
    text: '新的想法',
    x: Math.max(24, Math.round(board.scrollLeft + rect.width / 2 - 90)),
    y: Math.max(24, Math.round(board.scrollTop + rect.height / 2 - 60)),
    width: 180,
    height: 120,
    color: 'yellow',
    z_index: nextZIndex(),
    visible: true,
  };

  upsertNote(note);
  persist();
  startEditing(note.note_id);
}

function resetDemo() {
  if (!window.confirm('確定要重設展示資料嗎？')) return;
  notes.forEach((note) => note.element.remove());
  notes.clear();
  hiddenNotes.clear();
  maxZIndex = 1;
  STARTER_NOTES.forEach((note) => upsertNote({ ...note, visible: true }));
  persist();
  setStatus('展示資料已重設');
}

function clearBoard() {
  const visibleNotes = Array.from(notes.values());
  if (visibleNotes.length === 0) {
    setStatus('目前沒有可清除的便條貼');
    return;
  }

  if (!window.confirm(`確定要清除目前 ${visibleNotes.length} 張便條貼嗎？展示資料會保留為隱藏狀態。`)) return;

  for (const note of visibleNotes) {
    note.element.remove();
    notes.delete(note.note_id);
    hiddenNotes.set(note.note_id, { ...toSerializableNote(note), visible: false });
  }

  persist();
  updateBoardMeta();
  setStatus('已標記為隱藏，不再顯示');
}

function upsertNote(note) {
  const existing = notes.get(note.note_id);
  const element = existing?.element || createNoteElement(note.note_id);
  const state = {
    ...existing,
    ...note,
    element,
    visible: note.visible !== false,
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
  color.addEventListener('change', () => {
    const note = notes.get(noteId);
    note.color = color.value;
    note.z_index = nextZIndex();
    renderNote(note);
    persist();
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

function finishEditing(noteId) {
  if (!editingNotes.has(noteId)) return;
  const note = notes.get(noteId);
  if (!note) return;

  const editor = note.element.querySelector('.note-editor');
  editingNotes.delete(noteId);
  note.element.classList.remove('is-editing');
  note.text = editor.value.trim();
  note.z_index = nextZIndex();
  renderNote(note);
  persist();
}

function cancelEditing(noteId) {
  const note = notes.get(noteId);
  if (!note) return;
  editingNotes.delete(noteId);
  note.element.classList.remove('is-editing');
  renderNote(note);
}

function deleteNote(noteId) {
  const note = notes.get(noteId);
  if (!note) return;
  note.element.remove();
  notes.delete(noteId);
  persist();
  updateBoardMeta();
}

function beginDrag(event, noteId) {
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
  const end = (endEvent) => {
    if (endEvent.pointerId !== start.pointerId) return;
    note.element.removeEventListener('pointermove', move);
    note.element.removeEventListener('pointerup', end);
    note.element.removeEventListener('pointercancel', end);
    persist();
  };

  note.element.addEventListener('pointermove', move);
  note.element.addEventListener('pointerup', end);
  note.element.addEventListener('pointercancel', end);
}

function beginResize(event, noteId) {
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
  const end = (endEvent) => {
    if (endEvent.pointerId !== start.pointerId) return;
    note.element.removeEventListener('pointermove', move);
    note.element.removeEventListener('pointerup', end);
    note.element.removeEventListener('pointercancel', end);
    persist();
  };

  note.element.addEventListener('pointermove', move);
  note.element.addEventListener('pointerup', end);
  note.element.addEventListener('pointercancel', end);
}

function persist() {
  const serializable = [
    ...Array.from(hiddenNotes.values()),
    ...Array.from(notes.values()).map(toSerializableNote),
  ];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  setStatus('已儲存在本機瀏覽器');
  updateBoardMeta();
}

function toSerializableNote({ element, ...note }) {
  return { ...note, visible: note.visible !== false };
}

function loadNotes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function updateBoardMeta() {
  const count = notes.size;
  noteCount.textContent = `${count} 張`;
  emptyState.classList.toggle('hidden', count > 0);
}

function setStatus(message) {
  syncStatus.textContent = message;
}

function nextZIndex() {
  maxZIndex += 1;
  return maxZIndex;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
