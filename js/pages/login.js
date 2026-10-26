// ===== S01 – Đăng nhập: chọn vai trò -> mã PIN -> chọn tên =====
import { db } from '../db.js';
import { store, staffOf, seedIfNeeded, onChange } from '../store.js';
import { verifyPin, setName, logout, ROLE_NAME } from '../auth.js';
import { icon, logo, toast, modal, promptBox } from '../ui.js';
import { esc, initials } from '../utils.js';

let el, step, role, pin, offKey, offStore;

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
  } else if (step === 'name') {
    const list = staffOf(role);
    const ready = store.loaded.has('staff');
    inner = `<div class="center"><h2>Bạn là ai?</h2><p class="muted small">Chọn tên để ghi nhận người ${role === 'order' ? 'gọi món' : 'thu tiền'}</p></div>
      <div class="name-grid mt">${!ready ? '<div class="muted center" style="grid-column:1/-1">Đang tải…</div>' :
        list.map(s => `<button class="name-btn" data-name="${esc(s.name)}"><span class="avatar ${role}">${esc(initials(s.name))}</span>${esc(s.name)}</button>`).join('')}
        <button class="name-btn" data-name=""><span class="avatar" style="background:var(--muted)">+</span>Tên khác</button>
      </div>
      <button class="btn btn-ghost btn-block mt" data-act="cancel">${icon('back')} Đăng nhập lại</button>`;
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
    step = 'name'; render();
    // chỉ có 1 người cho vai trò -> tự chọn
    setTimeout(() => { const l = staffOf(role); if (step === 'name' && l.length === 1 && role === 'cashier') choose(l[0].name); }, 400);
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

async function choose(name) {
  if (!name) {
    name = await promptBox({ title: 'Nhập tên của bạn', placeholder: 'VD: Nam', okText: 'Vào làm việc', required: true });
    if (!name) return;
  }
  setName(name);
  toast(`Xin chào ${name} 👋`);
  location.hash = '#/tables';
}

export default {
  async mount(root) {
    el = root; step = store.user?.role && !store.user.name ? 'name' : 'role'; role = store.user?.role; pin = '';
    render();
    const onClick = e => {
      const t = e.target.closest('[data-role],[data-k],[data-name],[data-act]');
      if (!t) return;
      if (t.dataset.role) { role = t.dataset.role; step = 'pin'; pin = ''; render(); }
      else if (t.dataset.k) key(t.dataset.k);
      else if (t.dataset.name !== undefined) choose(t.dataset.name);
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
    offStore = onChange(keys => { if (step === 'name' && (keys.has('staff') || keys.has('settings'))) render(); });
    return () => { el.removeEventListener('click', onClick); removeEventListener('keydown', onKey); offStore?.(); };
  },
  // Đổi người dùng (cùng vai trò) không cần nhập lại PIN
  pickName() {
    const r = store.user.role;
    const list = staffOf(r);
    modal({
      title: 'Đổi người dùng',
      body: `<div class="name-grid">${list.map(s => `<button class="name-btn" data-name="${esc(s.name)}"><span class="avatar ${r}">${esc(initials(s.name))}</span>${esc(s.name)}</button>`).join('')}</div>`,
      onMount: api => api.$$('[data-name]').forEach(b => b.onclick = () => {
        api.close(); setName(b.dataset.name);
        document.querySelectorAll('.user-chip span:last-child').forEach(x => (x.textContent = b.dataset.name));
        document.querySelectorAll('.user-chip .avatar').forEach(x => (x.textContent = initials(b.dataset.name)));
        toast(`Đã chuyển sang ${b.dataset.name}`);
      }),
    });
  },
};
