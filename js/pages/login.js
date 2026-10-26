// ===== S01 – Đăng nhập: chọn vai trò -> mã PIN -> chọn tên =====
import { db } from '../db.js';
import { store, seedIfNeeded } from '../store.js';
import { verifyPin, logout, ROLE_NAME } from '../auth.js';
import { icon, logo, toast } from '../ui.js';
import { esc } from '../utils.js';

let el, step, role, pin;

function render() {
  const s = store.settings;
  let inner = '';
  if (step === 'role') {
    inner = `
      <div class="role-grid">
        <button class="role-card" data-role="order"><span class="ri">${icon('list')}</span><b>Order</b><span>Nhân viên phục vụ<br>gọi món tại bàn</span></button>
        <button class="role-card cashier" data-role="cashier"><span class="ri">${icon('cash')}</span><b>Thu Ngân</b><span>Thanh toán, quản lý<br>& báo cáo</span></button>
      </div>
      ${db.mode === 'local' ? `<div class="demo-hint">🧪 Chế độ demo · PIN Order <span class="kbd">111111</span> · Thu Ngân <span class="kbd">999999</span></div>` : ''}`;
  } else if (step === 'pin') {
    inner = `
      <div class="center"><span class="pill ${role === 'cashier' ? 'st-waiting' : 'st-open'}">${ROLE_NAME[role]}</span>
      <h2 class="mt">Nhập mã PIN</h2></div>
      <div class="pin-dots" id="dots">${Array.from({ length: 6 }, (_, i) => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join('')}</div>
      <div class="pinpad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join('')}
        <button class="fn" data-k="back">${icon('back')} Quay lại</button><button data-k="0">0</button><button class="fn" data-k="del" aria-label="Xóa">⌫</button>
      </div>`;
  }
  el.innerHTML = `<div class="login"><div class="login-card">
    <div class="login-logo">${logo()}<div><h1>${esc(s.shopName)}</h1><p class="muted small">${esc(s.slogan || 'Quản lý quán ăn')}</p></div></div>
    ${inner}</div></div>`;
}

async function submitPin() {
  const p = pin;
  try {
    await verifyPin(role, p);
    if (db.mode === 'firebase' && role === 'cashier') await seedIfNeeded();
    location.hash = '#/tables';
  } catch (e) {
    pin = ''; render();
    const d = el.querySelector('#dots'); d?.classList.add('shake');
    navigator.vibrate?.(200);
    toast(e.message || 'Mã PIN không đúng', 'err');
  }
}

function key(k) {
  if (step !== 'pin') return;
  if (k === 'back') { step = 'role'; pin = ''; return render(); }
  if (k === 'del') { pin = pin.slice(0, -1); return render(); }
  if (pin.length >= 6) return;
  pin += k; render();
  if (pin.length === 6) setTimeout(submitPin, 120);
}

export default {
  async mount(root) {
    el = root; step = 'role'; role = store.user?.role; pin = '';
    render();
    const onClick = e => {
      const t = e.target.closest('[data-role],[data-k],[data-act]');
      if (!t) return;
      if (t.dataset.role) { role = t.dataset.role; step = 'pin'; pin = ''; render(); }
      else if (t.dataset.k) key(t.dataset.k);
      else if (t.dataset.act === 'cancel') { logout(); step = 'role'; render(); }
    };
    const onKey = e => {
      if (step !== 'pin') return;
      if (/^\d$/.test(e.key)) key(e.key);
      else if (e.key === 'Backspace') key('del');
      else if (e.key === 'Escape') key('back');
    };
    el.addEventListener('click', onClick);
    addEventListener('keydown', onKey);
    return () => { el.removeEventListener('click', onClick); removeEventListener('keydown', onKey); };
  },
};
