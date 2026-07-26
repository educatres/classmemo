import { buildBoardUrl, generateId } from './config.js';
import { BOARD_LIFETIME_MS, createBoard, deleteBoard, subscribeToBoardCatalog } from './firebase-store.js';
import { renderQr } from './qr.js';

const form = document.querySelector('#setup-form');
const resultPanel = document.querySelector('#result-panel');
const studentLink = document.querySelector('#student-link');
const copyButton = document.querySelector('#copy-link');
const openBoard = document.querySelector('#open-board');
const copyStatus = document.querySelector('#copy-status');
const setupStatus = document.querySelector('#setup-status');
const qrCode = document.querySelector('#qr-code');
const boardList = document.querySelector('#board-list');
const boardListStatus = document.querySelector('#board-list-status');
const boardDirectoryToggle = document.querySelector('#board-directory-toggle');
const boardDirectoryPanel = document.querySelector('#board-directory-panel');
const boardDirectoryList = document.querySelector('#board-directory-list');
const teacherKey = document.querySelector('#teacher-key');
const studentKey = document.querySelector('#student-key');

let boardId = generateId('board');
let latestBoards = [];
const attemptedExpiredBoardCleanup = new Set();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const generatedStudentKey = generateStudentKey();
  const boardUrl = buildBoardUrl({ board_id: boardId, student_key: generatedStudentKey });
  const generatedTeacherKey = generateTeacherKey();

  setupStatus.textContent = '正在建立白板…';

  try {
    await createBoard(boardId, generatedTeacherKey, generatedStudentKey);
    studentLink.value = boardUrl;
    teacherKey.value = generatedTeacherKey;
    studentKey.value = generatedStudentKey;
    openBoard.href = boardUrl;
    renderQr(qrCode, boardUrl);
    resultPanel.classList.remove('hidden');
    copyStatus.textContent = '白板連結已產生。';
    setupStatus.textContent = '白板已建立。請記下老師六位數密鑰，再分享白板連結給學生。';
    boardId = generateId('board');
  } catch (error) {
    console.error(error);
    setupStatus.textContent = error.message || '白板建立失敗，請確認六位數密鑰後再試。';
  }
});

boardDirectoryToggle.addEventListener('click', () => {
  const isHidden = boardDirectoryPanel.classList.toggle('hidden');
  boardDirectoryToggle.setAttribute('aria-expanded', String(!isHidden));
});

copyButton.addEventListener('click', async () => {
  if (!studentLink.value) return;

  try {
    await navigator.clipboard.writeText(studentLink.value);
    copyStatus.textContent = '已複製連結。';
  } catch {
    studentLink.select();
    document.execCommand('copy');
    copyStatus.textContent = '已選取並嘗試複製連結。';
  }
});

subscribeToBoardCatalog((boards) => {
  latestBoards = boards;
  renderBoardList(boards);
  renderBoardDirectory(boards);
  cleanupExpiredBoards(boards);
}, () => {
  boardListStatus.textContent = '目前無法讀取白板清單，請稍後重新整理。';
});
window.setInterval(() => renderBoardList(latestBoards), 60000);

function renderBoardList(boards) {
  boardList.replaceChildren();

  if (boards.length === 0) {
    boardListStatus.textContent = '尚未建立白板。建立第一張白板後會顯示在這裡。';
    return;
  }

  boardListStatus.textContent = `目前共有 ${boards.length} 張白板。`;

  for (const board of boards) {
    const boardUrl = buildBoardUrl({ board_id: board.board_id });
    const item = document.createElement('li');
    item.className = 'board-list-item';

    const details = document.createElement('div');
    const title = document.createElement('strong');
    const meta = document.createElement('span');
    title.textContent = board.board_id;
    const remaining = Number(board.created_at) + BOARD_LIFETIME_MS - Date.now();
    meta.textContent = remaining > 0
      ? `距離失效：${formatRemainingTime(remaining)}`
      : '已到期，正在自動清除資料…';
    details.append(title, meta);

    const link = document.createElement('a');
    link.className = 'ghost-btn as-link';
    link.href = boardUrl;
    link.textContent = '開啟白板';

    item.append(details, link);
    boardList.append(item);
  }
}

function renderBoardDirectory(boards) {
  boardDirectoryList.replaceChildren();

  if (boards.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = '尚未建立白板。';
    boardDirectoryList.append(empty);
    return;
  }

  for (const board of boards) {
    const item = document.createElement('li');
    const name = document.createElement('strong');
    const firebaseId = document.createElement('code');
    name.textContent = `名稱：${board.board_name || board.board_id}`;
    firebaseId.textContent = `Firebase ID：boards/${board.board_id}`;
    item.append(name, firebaseId);
    boardDirectoryList.append(item);
  }
}

function generateTeacherKey() {
  const random = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(random).padStart(6, '0');
}

function generateStudentKey() {
  const random = crypto.getRandomValues(new Uint32Array(1))[0] % 1000;
  return String(random).padStart(3, '0');
}

function formatRemainingTime(milliseconds) {
  const totalMinutes = Math.ceil(milliseconds / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return `${days} 天 ${hours} 小時 ${minutes} 分`;
}

function cleanupExpiredBoards(boards) {
  for (const board of boards) {
    const isExpired = Number(board.created_at) + BOARD_LIFETIME_MS <= Date.now();
    if (!isExpired || attemptedExpiredBoardCleanup.has(board.board_id)) continue;

    attemptedExpiredBoardCleanup.add(board.board_id);
    deleteBoard(board.board_id).catch((error) => {
      console.error(error);
      attemptedExpiredBoardCleanup.delete(board.board_id);
    });
  }
}
