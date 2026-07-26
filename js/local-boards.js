const STORAGE_KEY = 'classMemo.openedBoards.v1';

function readBoards() {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.filter((board) => board && typeof board.boardId === 'string') : [];
  } catch {
    return [];
  }
}

function writeBoards(boards) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(boards));
  } catch (error) {
    console.warn('無法儲存本機白板記錄。', error);
  }
}

export function getOpenedBoards() {
  return readBoards().sort((first, second) => Number(second.lastOpenedAt) - Number(first.lastOpenedAt));
}

export function getOpenedBoard(boardId) {
  return readBoards().find((board) => board.boardId === boardId) || null;
}

export function saveOpenedBoard({ boardId, studentKey, teacherKey, createdAt }) {
  if (!boardId) return;

  const boards = readBoards();
  const previous = boards.find((board) => board.boardId === boardId) || {};
  const next = {
    ...previous,
    boardId,
    lastOpenedAt: Date.now(),
    ...(studentKey ? { studentKey } : {}),
    ...(teacherKey ? { teacherKey } : {}),
    ...(Number.isFinite(Number(createdAt)) ? { createdAt: Number(createdAt) } : {}),
  };
  writeBoards([next, ...boards.filter((board) => board.boardId !== boardId)]);
}

export function clearOpenedBoards() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('無法清除本機白板記錄。', error);
  }
}
