// Service worker: lưu sẵn giao diện để mở nhanh & dùng khi mất mạng
const CACHE = 'quanla-v1.0.37';
const SHELL = [
  './', 'index.html', 'manifest.json',
  'css/base.css', 'css/layout.css', 'css/components.css', 'css/pages.css',
  'js/app.js', 'js/config.js', 'js/db.js', 'js/store.js', 'js/auth.js', 'js/ui.js', 'js/utils.js',
  'js/bill.js', 'js/zalo.js', 'js/notify.js', 'js/actions.js',
  'js/pages/login.js', 'js/pages/tables.js', 'js/pages/order.js', 'js/pages/orders.js', 'js/pages/cashier.js',
  'js/pages/history.js', 'js/pages/reports.js', 'js/pages/admin.js', 'js/pages/soldout.js', 'js/pages/printer.js',
  'js/pages/inventory.js',
  'assets/icons/logo.svg', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Giao diện: thử mạng trước (nhanh & cập nhật tức thì). Mất mạng thì lấy cache (offline).
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const sameOrigin = url.origin === location.origin;
  const firebaseLib = url.hostname === 'www.gstatic.com' && url.pathname.includes('/firebasejs/');
  if (!sameOrigin && !firebaseLib) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res && res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(async () => {
      const cache = await caches.open(CACHE);
      return await cache.match(e.request, { ignoreSearch: sameOrigin });
    })
  );
});
