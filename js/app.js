// ===== Khởi động ứng dụng + điều hướng =====
import { initDB, db } from './db.js';
import { store, startSync, onChange, seedIfNeeded } from './store.js';
import { restore, logout, ROLE_NAME } from './auth.js';
import { icon, logo, toast, modal } from './ui.js';
import { esc, initials } from './utils.js';
import { unlockAudio, watchBills } from './notify.js';
import { APP_VERSION } from './config.js';

import login from './pages/login.js?v=1.0.41';
import tables from './pages/tables.js?v=1.0.43';
import order from './pages/order.js?v=1.0.46';
import orders from './pages/orders.js?v=1.0.41';
import bill from './pages/cashier.js?v=1.0.41';
import history from './pages/history.js?v=1.0.41';
import reports from './pages/reports.js?v=1.0.42';
import admin from './pages/admin.js?v=1.0.43';
import soldout from './pages/soldout.js?v=1.0.41';
import printer from './pages/printer.js?v=1.0.41';
import inventory from './pages/inventory.js?v=1.0.48';

const ROUTES = { login, tables, order, orders, bill, history, reports, admin, soldout, printer, inventory };
const NAV = {
  order: [['tables', 'Sơ đồ bàn', 'grid'], ['orders', 'Đơn', 'list']],
  cashier: [
    ['tables', 'Sơ đồ bàn', 'grid'],
    ['orders', 'Thu ngân', 'cash'],
    ['soldout', 'Hết món', 'ban'],
    ['inventory', 'Tồn kho', 'box'],
    ['history', 'Lịch sử', 'receipt'],
    ['reports', 'Báo cáo', 'chart'],
    ['printer', 'Máy in', 'print'],
    ['admin', 'Quản lý', 'settings'],
  ],
};
const ALLOWED = { order: ['tables', 'order', 'orders'], cashier: Object.keys(ROUTES) };

const app = document.getElementById('app');
let current = null;
let shellRole = null;

export const go = path => { location.hash = '#/' + path; };

function parse() {
  const [name, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: name || 'tables', params: rest.map(decodeURIComponent) };
}

let clockTimer = null;
function startClock() {
  if (clockTimer) clearInterval(clockTimer);
  const tick = () => {
    const now = new Date();
    const DAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const timeStr = `${hh}:${mm}:${ss}`;
    const dateStr = `${DAYS[now.getDay()]}, ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

    const tEl = document.getElementById('clockTime');
    const dEl = document.getElementById('clockDate');
    const topEl = document.getElementById('topClock');
    if (tEl) tEl.textContent = timeStr;
    if (dEl) dEl.textContent = dateStr;
    if (topEl) topEl.textContent = `${hh}:${mm}`;
  };
  tick();
  clockTimer = setInterval(tick, 1000);
}

function renderShell(role) {
  const nav = NAV[role];
  const u = store.user;
  app.innerHTML = `<div class="shell" id="shell">
    <aside class="sidenav">
      <div class="brand">${logo()}<div><span class="shop-name">${esc(store.settings.shopName)}</span><small>${ROLE_NAME[role]}</small></div></div>
      <nav>${nav.map(([k, l, i]) => `<a href="#/${k}" data-nav="${k}">${icon(i)}<span>${l}</span>${k === 'orders' ? '<b class="nav-badge" data-badge="orders"></b>' : ''}</a>`).join('')}</nav>
      <div class="side-foot">
        <div class="side-clock">
          <div class="clock-time">${icon('clock')} <span id="clockTime">--:--:--</span></div>
          <div class="clock-date" id="clockDate">--/--/----</div>
        </div>
        <button class="btn btn-ghost btn-block" data-act="logout" style="justify-content:flex-start">${icon('logout')} Đăng xuất</button>
        <div class="xs muted" style="padding:6px 12px">v${APP_VERSION} · ${db.mode === 'local' ? 'Chế độ demo' : 'Firebase'}</div>
      </div>
    </aside>
    <header class="topbar">
      <div class="brand">${logo()}<span class="shop-name">${esc(store.settings.shopName)}</span></div>
      <div class="topbar-title" id="pageTitle"></div>
      <div class="top-actions">
        <span class="net-badge">${icon('wifiOff')} Offline</span>
        <span class="top-clock" id="topClock">--:--</span>
        <button class="user-chip" data-act="user"><span class="avatar ${role}">${esc(initials(u.name))}</span><span>${esc(u.name)}</span></button>
      </div>
    </header>
    <main class="main" id="main"></main>
    <nav class="bottomnav">${nav.map(([k, l, i]) => `<a href="#/${k}" data-nav="${k}">${icon(i)}<span>${l}</span>${k === 'orders' ? '<b class="nav-badge" data-badge="orders"></b>' : ''}</a>`).join('')}</nav>
  </div>`;
  shellRole = role;
  startClock();
  app.querySelector('#shell').addEventListener('click', e => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'logout') logout();
    if (a === 'user') userMenu();
  });
}

function userMenu() {
  const u = store.user;
  modal({
    title: 'Tài khoản',
    body: `<div class="row" style="gap:12px"><span class="avatar ${u.role}" style="width:48px;height:48px;font-size:18px">${esc(initials(u.name))}</span>
      <div><b style="font-size:17px">${esc(u.name)}</b><div class="muted small">Vai trò: ${ROLE_NAME[u.role]}</div></div></div>
      <div class="notice mt">${icon('info')}<div>Dữ liệu: <b>${db.mode === 'local' ? 'Chế độ demo (lưu trên trình duyệt này)' : 'Firebase – đồng bộ mọi thiết bị'}</b></div></div>`,
    foot: `<button class="btn btn-danger-soft" data-lo>${icon('logout')} Đăng xuất</button>`,
    onMount: api => {
      api.$('[data-lo]').onclick = () => { api.close(); logout(); };
    },
  });
}

async function route() {
  const { name, params } = parse();
  const user = store.user;
  if (!user?.role && name !== 'login') return go('login');
  if (user?.role && name === 'login') return go('tables');
  if (user?.role && !ALLOWED[user.role].includes(name)) return go('tables');

  try { current?.cleanup?.(); } catch {}
  const page = ROUTES[name] || tables;

  if (name === 'login') { shellRole = null; current = { page, cleanup: await page.mount(app, params) }; return; }
  if (shellRole !== user.role || !document.getElementById('main')) renderShell(user.role);

  const shell = document.getElementById('shell');
  shell.classList.toggle('focus', !!page.focus);
  const main = document.getElementById('main');
  main.className = 'main' + (page.flush ? ' flush' : '');
  main.scrollTop = 0; window.scrollTo(0, 0);
  shell.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === name || (name === 'bill' && a.dataset.nav === 'orders') || (name === 'order' && a.dataset.nav === 'tables')));
  current = { page, cleanup: await page.mount(main, params) };
  const waiting = Object.values(store.bills).filter(b => b.status === 'waiting').length;
  shell.querySelectorAll('[data-badge="orders"]').forEach(el => (el.textContent = waiting || ''));
}

async function boot() {
  app.innerHTML = `<div class="splash"><div class="center">${logo()}<p class="muted small mt">Đang tải…</p></div></div>`;
  try { await initDB(); }
  catch (e) {
    console.error(e);
    app.innerHTML = `<div class="splash"><div class="center" style="max-width:420px">${logo()}<h2 class="mt">Chưa sẵn sàng chạy thật</h2><p class="muted small mt">${esc(e.message || 'Không kết nối được Firebase. Kiểm tra cấu hình và Internet.')}</p><p class="muted small mt">Cần cấu hình Firebase Web App, bật Email/Password Authentication, tạo tài khoản Order/Thu Ngân và triển khai Firestore Rules.</p><button class="btn btn-primary mt" onclick="location.reload()">Thử lại</button></div></div>`;
    return;
  }
  if (db.mode === 'local') await seedIfNeeded();
  const s = restore();
  if (s?.name) startSync();

  onChange(keys => {
    if (keys.has('settings')) document.querySelectorAll('.shop-name').forEach(el => (el.textContent = store.settings.shopName));
    current?.page?.update?.(keys);
  });
  watchBills();
  addEventListener('hashchange', route);
  addEventListener('pointerdown', unlockAudio, { once: true });
  addEventListener('db-error', e => {
    const err = e.detail;
    console.error(err);
    toast(/permission/i.test(err?.code || '') ? 'Không có quyền thực hiện thao tác này' : 'Lỗi đồng bộ dữ liệu', 'err');
  });
  const net = () => document.body.classList.toggle('offline', !navigator.onLine);
  addEventListener('online', () => { net(); toast('Đã có mạng – đang đồng bộ', 'ok'); });
  addEventListener('offline', () => { net(); toast('Mất mạng – vẫn gọi món được, sẽ tự đồng bộ', 'warn', 4000); });
  net();
  route();

  if ('serviceWorker' in navigator) {
    if (location.protocol !== 'https:' || location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
      navigator.serviceWorker.getRegistrations().then(regs => { for (const r of regs) r.unregister(); });
      if (window.caches) caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
    } else {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
}
boot();
