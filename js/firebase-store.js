import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  getDatabase,
  get,
  onValue,
  ref,
  remove,
  serverTimestamp,
  set,
  update,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);
let anonymousSignInPromise;

export const BOARD_LIFETIME_MS = 3 * 24 * 60 * 60 * 1000;

function validateTeacherPin(pin) {
  if (!/^\d{6}$/.test(pin)) {
    throw new Error('老師登入密鑰必須是六位數字。');
  }
}

function validateStudentPin(pin) {
  if (!/^\d{3}$/.test(pin)) {
    throw new Error('學生登入密鑰必須是三位數字。');
  }
}

export async function ensureSignedIn() {
  if (auth.currentUser) return auth.currentUser;

  if (!anonymousSignInPromise) {
    anonymousSignInPromise = signInAnonymously(auth)
      .then((credential) => credential.user)
      .catch((error) => {
        throw new Error('無法完成匿名登入，請確認 Firebase Authentication 已啟用「匿名」登入方式。', { cause: error });
      })
      .finally(() => {
        anonymousSignInPromise = undefined;
      });
  }

  return anonymousSignInPromise;
}

export async function subscribeToNotes(boardId, onNotes, onError) {
  await ensureSignedIn();
  return onValue(
    ref(database, `boards/${boardId}/notes`),
    (snapshot) => {
      const value = snapshot.val() || {};
      onNotes(Object.values(value));
    },
    onError,
  );
}

export async function createBoard(boardId, teacherPin, studentPin) {
  validateTeacherPin(teacherPin);
  validateStudentPin(studentPin);
  const teacherUid = (await ensureSignedIn()).uid;

  await set(ref(database, `boards/${boardId}`), {
    settings: {
      frozen: false,
      created_at: serverTimestamp(),
    },
    admins: {
      [teacherUid]: true,
    },
  });

  await set(ref(database, `boardCatalog/${boardId}`), {
    board_id: String(boardId),
    created_at: serverTimestamp(),
  });
  await set(ref(database, `teacherKeys/${boardId}`), teacherPin);
  await set(ref(database, `studentKeys/${boardId}`), studentPin);
}

export async function claimStudentAccess(boardId, studentPin) {
  validateStudentPin(studentPin);
  const user = await ensureSignedIn();
  await set(ref(database, `studentKeyClaims/${boardId}/${user.uid}`), studentPin);
}

export async function claimTeacherAccess(boardId, teacherPin) {
  validateTeacherPin(teacherPin);
  const user = await ensureSignedIn();

  await set(ref(database, `teacherKeyClaims/${boardId}/${user.uid}`), teacherPin);
  await set(ref(database, `boards/${boardId}/admins/${user.uid}`), true);
}

export async function isCurrentUserBoardTeacher(boardId) {
  const user = await ensureSignedIn();
  const snapshot = await get(ref(database, `boards/${boardId}/admins/${user.uid}`));
  return snapshot.val() === true;
}

export async function getTeacherKey(boardId) {
  await ensureSignedIn();
  const snapshot = await get(ref(database, `teacherKeys/${boardId}`));
  return snapshot.val();
}

export async function getStudentKey(boardId) {
  await ensureSignedIn();
  const snapshot = await get(ref(database, `studentKeys/${boardId}`));
  return snapshot.val();
}

export async function setStudentKey(boardId, studentPin) {
  validateStudentPin(studentPin);
  await ensureSignedIn();
  await set(ref(database, `studentKeys/${boardId}`), studentPin);
}

export async function subscribeToBoardCatalog(onBoards, onError) {
  await ensureSignedIn();
  return onValue(
    ref(database, 'boardCatalog'),
    (snapshot) => {
      const boards = Object.values(snapshot.val() || {});
      boards.sort((first, second) => Number(second.created_at) - Number(first.created_at));
      onBoards(boards);
    },
    onError,
  );
}

export async function subscribeToBoardSettings(boardId, onSettings, onError) {
  await ensureSignedIn();
  return onValue(ref(database, `boards/${boardId}/settings`), (snapshot) => onSettings(snapshot.val()), onError);
}

export async function getBoardSettings(boardId) {
  await ensureSignedIn();
  const snapshot = await get(ref(database, `boards/${boardId}/settings`));
  return snapshot.val();
}

export async function setBoardFrozen(boardId, frozen) {
  await ensureSignedIn();
  await update(ref(database, `boards/${boardId}/settings`), { frozen: Boolean(frozen) });
}

export async function deleteBoard(boardId) {
  await ensureSignedIn();
  await update(ref(database), {
    [`boards/${boardId}`]: null,
    [`boardCatalog/${boardId}`]: null,
    [`teacherKeys/${boardId}`]: null,
    [`teacherKeyClaims/${boardId}`]: null,
    [`studentKeys/${boardId}`]: null,
    [`studentKeyClaims/${boardId}`]: null,
  });
}

export async function replaceBoardNotes(boardId, notes) {
  await ensureSignedIn();
  const payload = Object.fromEntries(
    notes.map((note) => [note.note_id, {
      ...note,
      updated_at: serverTimestamp(),
    }]),
  );
  await set(ref(database, `boards/${boardId}/notes`), payload);
}

export async function getBoardData(boardId) {
  await ensureSignedIn();
  const snapshot = await get(ref(database, `boards/${boardId}`));
  return snapshot.val();
}

export async function fetchNotes(boardId) {
  await ensureSignedIn();
  const snapshot = await get(ref(database, `boards/${boardId}/notes`));
  return Object.values(snapshot.val() || {});
}

export async function saveNote(boardId, note) {
  await ensureSignedIn();
  const payload = {
    note_id: note.note_id,
    text: String(note.text || '').slice(0, 1000),
    x: Math.round(Number(note.x) || 0),
    y: Math.round(Number(note.y) || 0),
    width: Math.round(Number(note.width) || 180),
    height: Math.round(Number(note.height) || 120),
    color: note.color || 'yellow',
    z_index: Math.round(Number(note.z_index) || 1),
    updated_at: serverTimestamp(),
  };

  await set(ref(database, `boards/${boardId}/notes/${note.note_id}`), payload);
}

export async function deleteNoteFromBoard(boardId, noteId) {
  await ensureSignedIn();
  await remove(ref(database, `boards/${boardId}/notes/${noteId}`));
}

export async function clearBoardNotes(boardId) {
  await ensureSignedIn();
  await remove(ref(database, `boards/${boardId}/notes`));
}
