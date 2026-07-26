import { buildBoardUrl, generateId } from './config.js';
import { registerBoard, subscribeToBoardCatalog } from './firebase-store.js';
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

let boardId = generateId('board');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const boardUrl = buildBoardUrl({ board_id: boardId });

  studentLink.value = boardUrl;
  openBoard.href = boardUrl;
  renderQr(qrCode, boardUrl);
  resultPanel.classList.remove('hidden');
  setupStatus.textContent = '正在建立白板…';
  copyStatus.textContent = '白板連結已產生。';

  try {
    await registerBoard(boardId);
    setupStatus.textContent = '白板已建立，分享連結給學生即可開始。';
  } catch (error) {
    console.error(error);
    setupStatus.textContent = '白板連結已產生，但尚未能儲存到清單，請稍後重新整理。';
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

subscribeToBoardCatalog(renderBoardList, () => {
  boardListStatus.textContent = '目前無法讀取白板清單，請稍後重新整理。';
});

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
    meta.textContent = `最後更新：${formatUpdatedAt(board.updated_at)}`;
    details.append(title, meta);

    const link = document.createElement('a');
    link.className = 'ghost-btn as-link';
    link.href = boardUrl;
    link.textContent = '開啟白板';

    item.append(details, link);
    boardList.append(item);
  }
}

function formatUpdatedAt(timestamp) {
  if (!timestamp) return '剛建立';
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}
