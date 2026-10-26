// ===== Thành phần giao diện dùng chung: icon, logo, toast, modal =====
import { esc } from './utils.js';

const P = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  list: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6"/>',
  receipt: '<path d="M5 2h14v20l-3-2-2 2-2-2-2 2-2-2-3 2Z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
  chart: '<path d="M3 3v18h18"/><path d="M8 16v-4M13 16V8M18 16v-7"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  next: '<path d="m9 18 6-6-6-6"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM21 14v.01M14 21h.01M17 17h4v4h-4"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 9M22 21a7 7 0 0 0-4-6.3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  move: '<path d="m16 3 4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16"/>',
  merge: '<path d="M8 3v5a4 4 0 0 0 4 4 4 4 0 0 1 4 4v5M16 3v5a4 4 0 0 1-4 4"/><path d="m5 18 3 3 3-3"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  note: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>',
  bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  wifiOff: '<path d="m2 2 20 20M8.5 16.4a5 5 0 0 1 7 0M5 12.6a10 10 0 0 1 5.2-2.6M19 12.6a10 10 0 0 0-2.4-1.7M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 11 5M12 20h.01"/>',
  chef: '<path d="M6 13.9A4 4 0 0 1 7.5 6a5 5 0 0 1 9 0A4 4 0 0 1 18 13.9V21H6Z"/><path d="M6 17h12"/>',
  store: '<path d="M3 9 4.5 4h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6"/>',
  zalo: '<path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.3-4.6A8.5 8.5 0 1 1 21 11.5Z"/><path d="M8 9.5h4l-4 5h4M15 9.5v5"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><path d="M7.5 7.5h.01"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7Z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  utensils: '<path d="M3 2v7a3 3 0 0 0 3 3v10M9 2v7a3 3 0 0 1-3 3M6 2v5M18 22V2a4 4 0 0 0-4 4v7h4"/>',
};
export const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;

export const logo = () => `<svg viewBox="0 0 64 64" aria-label="Quán Lá"><rect width="64" height="64" rx="16" fill="#1F7A4D"/><path d="M15 49C15 27 28 14 50 14C50 36 37 49 15 49Z" fill="#fff"/><path d="M19 45Q30 36 42 22" stroke="#1F7A4D" stroke-width="2.8" stroke-linecap="round" fill="none"/><path d="M15 49l-5 5" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="50" cy="50" r="5" fill="#F59E0B"/></svg>`;

export function setTitle(t) {
  const el = document.getElementById('pageTitle');
  if (el) el.textContent = t;
  document.title = (t ? t + ' · ' : '') + 'Quán Lá';
}

/* ---------- Toast ---------- */
export function toast(msg, type = 'ok', ms = 2600) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  const ic = { ok: 'check', warn: 'alert', err: 'alert', info: 'info' }[type] || 'info';
  el.innerHTML = icon(ic) + `<span>${esc(msg)}</span>`;
  root.appendChild(el);
  while (root.children.length > 3) root.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}

/* ---------- Modal / Bottom sheet ---------- */
export function modal({ title = '', body = '', foot = '', wide = false, onMount, dismissible = true } = {}) {
  const root = document.getElementById('modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-h"><h2>${title}</h2><button class="icon-btn sm" data-close aria-label="Đóng">${icon('x')}</button></div>
    <div class="modal-b">${body}</div>
    ${foot ? `<div class="modal-f">${foot}</div>` : ''}
  </div>`;
  root.appendChild(wrap);
  let resolver;
  const result = new Promise(r => (resolver = r));
  const close = val => {
    if (!wrap.isConnected) return;
    wrap.remove(); document.removeEventListener('keydown', onKey); resolver(val);
  };
  const onKey = e => { if (e.key === 'Escape' && dismissible) close(null); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', e => {
    if ((e.target === wrap && dismissible) || e.target.closest('[data-close]')) close(null);
  });
  const api = { el: wrap.querySelector('.modal'), close, result, $: s => wrap.querySelector(s), $$: s => [...wrap.querySelectorAll(s)] };
  onMount?.(api);
  const first = wrap.querySelector('input:not([type=checkbox]),textarea');
  if (first && matchMedia('(pointer:fine)').matches) setTimeout(() => first.focus(), 50);
  return api;
}

export function confirmBox(message, { title = 'Xác nhận', okText = 'Đồng ý', danger = false } = {}) {
  const m = modal({
    title,
    body: `<p>${message}</p>`,
    foot: `<button class="btn" data-close>Hủy</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${okText}</button>`,
    onMount: api => api.$('[data-ok]').onclick = () => api.close(true),
  });
  return m.result.then(v => !!v);
}

// Hộp nhập liệu nhanh (có chip gợi ý)
export function promptBox({ title, label = '', value = '', placeholder = '', type = 'text', chips = [], okText = 'Lưu', required = false, multi = false } = {}) {
  const m = modal({
    title,
    body: `<label class="field">${label ? `<span>${label}</span>` : ''}
        ${multi ? `<textarea class="input" data-in placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
                : `<input class="input" data-in type="${type}" inputmode="${type === 'number' ? 'numeric' : 'text'}" value="${esc(value)}" placeholder="${esc(placeholder)}">`}
      </label>
      ${chips.length ? `<div class="chips wrap mt">${chips.map(c => `<button class="chip chip-sm" data-chip="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}`,
    foot: `<button class="btn" data-close>Hủy</button><button class="btn btn-primary" data-ok>${okText}</button>`,
    onMount: api => {
      const inp = api.$('[data-in]');
      const ok = () => { const v = inp.value.trim(); if (required && !v) { inp.focus(); return; } api.close(v); };
      api.$('[data-ok]').onclick = ok;
      if (!multi) inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
      api.$$('[data-chip]').forEach(b => b.onclick = () => {
        const c = b.dataset.chip, cur = inp.value.trim();
        const parts = cur ? cur.split(/\s*,\s*/) : [];
        inp.value = parts.includes(c) ? parts.filter(p => p !== c).join(', ') : [...parts, c].join(', ');
        b.classList.toggle('active');
      });
      const cur = String(value || '').split(/\s*,\s*/);
      api.$$('[data-chip]').forEach(b => cur.includes(b.dataset.chip) && b.classList.add('active'));
    },
  });
  return m.result.then(v => (v === null || v === undefined ? null : v));
}

// Chọn 1 mục trong danh sách
export function pickBox({ title, items, empty = 'Không có lựa chọn' }) {
  const m = modal({
    title,
    body: items.length ? `<div class="name-grid">${items.map((it, i) =>
      `<button class="name-btn" data-i="${i}">${it.icon || ''}<span class="grow"><b>${esc(it.label)}</b>${it.sub ? `<div class="xs muted">${esc(it.sub)}</div>` : ''}</span></button>`).join('')}</div>`
      : `<div class="empty">${empty}</div>`,
    onMount: api => api.$$('[data-i]').forEach(b => b.onclick = () => api.close(items[+b.dataset.i].value)),
  });
  return m.result;
}
