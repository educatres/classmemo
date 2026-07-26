import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  getDatabase,
  onValue,
  ref,
  remove,
  serverTimestamp,
  set,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

export async function ensureSignedIn() {
  if (auth.currentUser) return auth.currentUser;

  const signedIn = new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        if (user) resolve(user);
      },
      reject,
    );
  });

  try {
    await signInAnonymously(auth);
    return await signedIn;
  } catch (error) {
    throw new Error('無法完成匿名登入，請確認 Firebase Authentication 已啟用「匿名」登入方式。', { cause: error });
  }
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
