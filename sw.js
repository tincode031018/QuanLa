// Service worker: lưu sẵn giao diện để mở nhanh & dùng khi mất mạng
const CACHE = 'quanla-v1.0.3';
const SHELL = [
  './', 'index.html', 'manifest.json',
  'css/base.css', 'css/layout.css', 'css/components.css', 'css/pages.css',
  'js/app.js', 'js/config.js', 'js/db.js', 'js/store.js', 'js/auth.js', 'js/ui.js', 'js/utils.js',
  'js/bill.js', 'js/zalo.js', 'js/notify.js', 'js/actions.js',
  'js/pages/login.js', 'js/pages/tables.js', 'js/pages/order.js', 'js/pages/orders.js', 'js/pages/cashier.js',
  'js/pages/history.js', 'js/pages/reports.js', 'js/pages/admin.js', 'js/pages/soldout.js',
  'assets/icons/logo.svg', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Giao diện: lấy cache trước, cập nhật nền (stale-while-revalidate). API/Firebase: đi thẳng mạng.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const sameOrigin = url.origin === location.origin;
  const firebaseLib = url.hostname === 'www.gstatic.com' && url.pathname.includes('/firebasejs/');
  if (!sameOrigin && !firebaseLib) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(e.request, { ignoreSearch: sameOrigin });
    const net = fetch(e.request).then(res => { if (res.ok) cache.put(e.request, res.clone()); return res; }).catch(() => cached);
    return cached || net;
  }));
});
