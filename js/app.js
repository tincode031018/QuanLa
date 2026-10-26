// ===== Khởi động ứng dụng + điều hướng =====
import { initDB, db } from './db.js';
import { store, startSync, onChange, seedIfNeeded } from './store.js';
import { restore, logout, ROLE_NAME } from './auth.js';
import { icon, logo, toast, modal } from './ui.js';
import { esc, initials } from './utils.js';
import { unlockAudio, watchBills } from './notify.js';
import { APP_VERSION } from './config.js';

import login from './pages/login.js';
import tables from './pages/tables.js';
import order from './pages/order.js';
import orders from './pages/orders.js';
import bill from './pages/cashier.js';
import history from './pages/history.js';
import reports from './pages/reports.js';
import admin from './pages/admin.js';
import soldout from './pages/soldout.js';

const ROUTES = { login, tables, order, orders, bill, history, reports, admin, soldout };
const NAV = {
  order: [['tables', 'Sơ đồ bàn', 'grid'], ['orders', 'Đơn', 'list'], ['soldout', 'Hết món', 'ban']],
  cashier: [['tables', 'Sơ đồ bàn', 'grid'], ['orders', 'Thu ngân', 'cash'], ['history', 'Lịch sử', 'receipt'], ['reports', 'Báo cáo', 'chart'], ['admin', 'Quản lý', 'settings']],
};
const ALLOWED = { order: ['tables', 'order', 'orders', 'soldout'], cashier: Object.keys(ROUTES) };

const app = document.getElementById('app');
let current = null;
let shellRole = null;

export const go = path => { location.hash = '#/' + path; };

function parse() {
  const [name, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: name || 'tables', params: rest.map(decodeURIComponent) };
}

function renderShell(role) {
  const nav = NAV[role];
  const u = store.user;
  app.innerHTML = `<div class="shell" id="shell">
    <aside class="sidenav">
      <div class="brand">${logo()}<div><span class="shop-name">${esc(store.settings.shopName)}</span><small>${ROLE_NAME[role]}</small></div></div>
      <nav>${nav.map(([k, l, i]) => `<a href="#/${k}" data-nav="${k}">${icon(i)}<span>${l}</span>${k === 'orders' ? '<b class="nav-badge" data-badge="orders"></b>' : ''}</a>`).join('')}</nav>
      <div class="side-foot"><button class="btn btn-ghost btn-block" data-act="logout" style="justify-content:flex-start">${icon('logout')} Đăng xuất</button>
      <div class="xs muted" style="padding:6px 12px">v${APP_VERSION} · ${db.mode === 'local' ? 'Chế độ demo' : 'Firebase'}</div></div>
    </aside>
    <header class="topbar">
      <div class="brand">${logo()}<span class="shop-name">${esc(store.settings.shopName)}</span></div>
      <div class="topbar-title" id="pageTitle"></div>
      <div class="top-actions">
        <span class="net-badge">${icon('wifiOff')} Offline</span>
        <button class="user-chip" data-act="user"><span class="avatar ${role}">${esc(initials(u.name))}</span><span>${esc(u.name)}</span></button>
      </div>
    </header>
    <main class="main" id="main"></main>
    <nav class="bottomnav">${nav.map(([k, l, i]) => `<a href="#/${k}" data-nav="${k}">${icon(i)}<span>${l}</span>${k === 'orders' ? '<b class="nav-badge" data-badge="orders"></b>' : ''}</a>`).join('')}</nav>
  </div>`;
  shellRole = role;
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
    foot: `<button class="btn" data-sw>${icon('users')} Đổi người dùng</button><button class="btn btn-danger-soft" data-lo>${icon('logout')} Đăng xuất</button>`,
    onMount: api => {
      api.$('[data-lo]').onclick = () => { api.close(); logout(); };
      api.$('[data-sw]').onclick = () => { api.close(); login.pickName(true); };
    },
  });
}

async function route() {
  const { name, params } = parse();
  const user = store.user;
  if (!user?.name && name !== 'login') return go('login');
  if (user?.name && name === 'login') return go('tables');
  if (user?.name && !ALLOWED[user.role].includes(name)) return go('tables');

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

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
