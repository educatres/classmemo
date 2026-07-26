import { buildBoardUrl, generateId } from './config.js';
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

let boardId = generateId('board');

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const boardUrl = buildBoardUrl({ board_id: boardId });

  studentLink.value = boardUrl;
  openBoard.href = boardUrl;
  renderQr(qrCode, boardUrl);
  resultPanel.classList.remove('hidden');
  setupStatus.textContent = '白板已建立，分享連結給學生即可開始。';
  copyStatus.textContent = '白板連結已產生。';
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
