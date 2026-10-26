// ===== Hàm tiện ích =====
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const nf = new Intl.NumberFormat('vi-VN');
export const num = n => nf.format(Math.round(n || 0));
export const money = n => num(n) + 'đ';
export function short(n) {
  n = Math.round(n || 0);
  if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1).replace('.', ',') + 'tr';
  if (n >= 1000) return Math.round(n / 1000) + 'k';
  return String(n);
}
export const parseMoney = s => parseInt(String(s || '').replace(/[^\d]/g, ''), 10) || 0;

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
}
const pad = n => String(n).padStart(2, '0');
export function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const fmtTime = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const fmtDate = ts => { const d = new Date(ts); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
export const fmtDT = ts => `${fmtTime(ts)} ${fmtDate(ts)}`;
export const fmtDay = key => { const [y, m, d] = key.split('-'); return `${d}/${m}/${y}`; };
export const minutesSince = ts => Math.max(0, Math.floor((Date.now() - (ts || Date.now())) / 60000));
export function dur(min) {
  if (min < 60) return `${min}'`;
  return `${Math.floor(min / 60)}h${pad(min % 60)}`;
}
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n).getTime());
}
export function debounce(fn, ms = 300) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
// Băm mã PIN (chế độ demo). Firebase dùng mật khẩu thật nên không cần.
export function hashPin(pin) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  const s = 'quanla:' + pin;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16);
}
export const initials = name => norm(name).split(/\s+/).filter(Boolean).slice(-1)[0]?.[0]?.toUpperCase() || '?';
export const clone = o => (o == null ? o : JSON.parse(JSON.stringify(o)));
export function download(filename, content, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
