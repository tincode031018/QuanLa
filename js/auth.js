// ===== Đăng nhập theo vai trò + mã PIN =====
import { db } from './db.js';
import { store, startSync, stopSync } from './store.js';
import { resetWatch } from './notify.js';

const KEY = 'ql_session';
export const ROLE_NAME = { order: 'Order', cashier: 'Thu Ngân' };

export function restore() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
  if (!s) return null;
  if (db.mode === 'firebase' && (!db.isAuthed() || db.authRole() !== s.role)) { localStorage.removeItem(KEY); return null; }
  store.user = s;
  return s;
}
export async function verifyPin(role, pin) {
  await db.signIn(role, pin);
  store.user = { role, name: '', at: Date.now() };
  startSync();
}
export function setName(name) {
  store.user = { ...store.user, name };
  localStorage.setItem(KEY, JSON.stringify(store.user));
}
export async function logout() {
  stopSync(); resetWatch();
  try { await db.signOut(); } catch {}
  localStorage.removeItem(KEY);
  store.user = null; store.bills = {}; store.unseen.clear();
  location.hash = '#/login';
}

// Tự khóa máy Thu Ngân khi không dùng
let last = Date.now();
['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, () => (last = Date.now()), { passive: true }));
setInterval(() => {
  const m = store.settings.lockMinutes;
  if (store.user?.role === 'cashier' && m > 0 && Date.now() - last > m * 60000) logout();
}, 30000);
