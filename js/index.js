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
const resetBoardIdButton = document.querySelector('#reset-board-id');
const qrCode = document.querySelector('#qr-code');
const boardList = document.querySelector('#board-list');
const boardListStatus = document.querySelector('#board-list-status');
const teacherKey = document.querySelector('#teacher-key');

let boardId = generateId('board');
let latestBoards = [];
const attemptedExpiredBoardCleanup = new Set();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const boardUrl = buildBoardUrl({ board_id: boardId });
  const generatedTeacherKey = generateTeacherKey();

  setupStatus.textContent = '正在建立白板…';

  try {
    await createBoard(boardId, generatedTeacherKey);
    studentLink.value = boardUrl;
    teacherKey.value = generatedTeacherKey;
    openBoard.href = boardUrl;
    renderQr(qrCode, boardUrl);
    resultPanel.classList.remove('hidden');
    copyStatus.textContent = '白板連結已產生。';
    setupStatus.textContent = '白板已建立。請記下老師六位數密鑰，再分享白板連結給學生。';
  } catch (error) {
    console.error(error);
    setupStatus.textContent = error.message || '白板建立失敗，請確認六位數密鑰後再試。';
  }
});

resetBoardIdButton.addEventListener('click', () => {
  boardId = generateId('board');
  resultPanel.classList.add('hidden');
  setupStatus.textContent = '已重設白板 ID；按「產生白板連結」即可建立新的空白白板。';
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

function generateTeacherKey() {
  const random = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(random).padStart(6, '0');
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
