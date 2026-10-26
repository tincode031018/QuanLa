// ===== Tính tiền, mẫu phiếu bếp / hóa đơn (chữ Zalo, bản in 80mm, ảnh) =====
import { store } from './store.js';
import { money, num, esc, fmtTime, fmtDate, fmtDT } from './utils.js';

export const BANKS = [
  ['970436', 'Vietcombank'], ['970415', 'VietinBank'], ['970418', 'BIDV'], ['970405', 'Agribank'],
  ['970407', 'Techcombank'], ['970422', 'MB Bank'], ['970416', 'ACB'], ['970432', 'VPBank'],
  ['970423', 'TPBank'], ['970403', 'Sacombank'], ['970441', 'VIB'], ['970437', 'HDBank'],
  ['970443', 'SHB'], ['970448', 'OCB'], ['970426', 'MSB'], ['970440', 'SeABank'],
  ['970449', 'LPBank'], ['970431', 'Eximbank'], ['970428', 'Nam A Bank'],
];
export const bankName = bin => BANKS.find(b => b[0] === bin)?.[1] || '';

export const liveItems = bill => (bill?.items || []).filter(i => !i.void);
export const itemCount = items => items.reduce((s, i) => s + i.qty, 0);
export const sumItems = items => items.reduce((s, i) => s + i.price * i.qty, 0);

export function adjAmount(adj, subtotal) {
  if (!adj || !adj.value) return 0;
  return Math.round(adj.type === 'percent' ? subtotal * adj.value / 100 : adj.value);
}
export function calc(bill, discount = bill?.discount, surcharge = bill?.surcharge) {
  const items = liveItems(bill);
  const subtotal = sumItems(items);
  const discountAmt = Math.min(subtotal, adjAmount(discount, subtotal));
  const surchargeAmt = adjAmount(surcharge, subtotal);
  return { items, subtotal, discountAmt, surchargeAmt, total: Math.max(0, subtotal - discountAmt + surchargeAmt), count: itemCount(items) };
}
function shopContact(s = store.settings) {
  const legacy = String(s.phone || '').match(/^(.*?)\s+-\s+(.+)$/);
  return { phone: legacy ? legacy[1] : (s.phone || ''), owner: s.ownerName || legacy?.[2] || '' };
}
export const adjLabel = (adj, fallback) => {
  if (!adj || !adj.value) return fallback;
  const name = adj.label || fallback;
  return adj.type === 'percent' ? `${name} ${adj.value}%` : name;
};

// Gộp món trùng (cùng món, cùng giá, cùng ghi chú)
export function groupItems(items) {
  const m = new Map();
  for (const it of items) {
    const k = `${it.menuId}|${it.price}|${it.note || ''}`;
    const g = m.get(k);
    if (g) g.qty += it.qty; else m.set(k, { ...it });
  }
  return [...m.values()];
}
export function rounds(bill) {
  const map = new Map();
  for (const it of bill?.items || []) {
    if (!map.has(it.round)) map.set(it.round, { round: it.round, at: it.at, by: it.by, items: [] });
    map.get(it.round).items.push(it);
  }
  return [...map.values()].sort((a, b) => a.round - b.round);
}
export const payLabel = m => ({ cash: 'Tiền mặt', transfer: 'Chuyển khoản', mixed: 'Tiền mặt + Chuyển khoản' }[m] || '');

export function vietQR(amount, info) {
  const b = store.settings.bank || {};
  if (!b.bin || !b.accountNo) return '';
  const q = new URLSearchParams({ amount: String(Math.round(amount)), addInfo: info || '', accountName: b.accountName || '' });
  return `https://img.vietqr.io/image/${b.bin}-${b.accountNo}-compact2.png?${q}`;
}
export const qrInfo = bill => `${(bill.tableName || '').replace(/\s/g, '')} ${bill.code || ''}`.trim();

/* ---------- CHỮ gửi Zalo ---------- */
const HR = '──────────────';
export function kitchenText({ tableName, round, items, by, at, cancel = false, reason = '' }) {
  const s = store.settings;
  const lines = [
    cancel ? `HỦY MÓN – ${tableName.toUpperCase()}` : `PHIẾU BẾP – ${tableName.toUpperCase()}${round > 1 ? ` (gọi thêm lần ${round})` : ''}`,
    `${fmtTime(at)} · ${by}`,
    HR,
  ];
  for (const it of items) {
    lines.push(`${it.qty} x ${it.name}`);
    if (it.note) lines.push(`   ↳ ${it.note}`);
  }
  lines.push(HR);
  if (cancel && reason) lines.push(`Lý do: ${reason}`);
  else lines.push(`Tổng: ${itemCount(items)} món`);
  lines.push(s.shopName);
  return lines.join('\n');
}

export function billText(bill, { draft = false } = {}) {
  const s = store.settings;
  const c = calc(bill);
  const lines = [
    `${s.shopName.toUpperCase()} – ${draft ? 'TẠM TÍNH' : 'HÓA ĐƠN'}`,
    s.address || '61k/Xã Hòa Phú,H.Long Hồ,Vĩnh Long',
    ...(shopContact(s).phone ? [`ĐT: ${shopContact(s).phone}`] : []),
    ...(shopContact(s).owner ? [`Chủ quán: ${shopContact(s).owner}`] : []),
    `${bill.code ? `Mã: ${bill.code} · ` : ''}${bill.tableName}`,
    `${fmtTime(bill.openedAt)}${bill.closedAt ? ` – ${fmtTime(bill.closedAt)}` : ''} · ${fmtDate(bill.closedAt || Date.now())}`,
    HR,
  ];
  for (const it of groupItems(c.items)) {
    lines.push(`${it.name} x${it.qty} = ${num(it.price * it.qty)}`);
    if (it.note) lines.push(`   (${it.note})`);
  }
  lines.push(HR, `Tạm tính: ${money(c.subtotal)}`);
  if (c.discountAmt) lines.push(`${adjLabel(bill.discount, 'Giảm giá')}: -${money(c.discountAmt)}`);
  if (c.surchargeAmt) lines.push(`${adjLabel(bill.surcharge, 'Phụ thu')}: +${money(c.surchargeAmt)}`);
  lines.push(`TỔNG CỘNG: ${money(c.total)}`);
  if (bill.pay) {
    lines.push(payLabel(bill.pay.method));
    if (bill.pay.method === 'cash' && bill.pay.received > c.total) lines.push(`Khách đưa: ${money(bill.pay.received)} · Thối: ${money(bill.pay.received - c.total)}`);
    if (bill.pay.method === 'mixed') lines.push(`TM: ${money(bill.pay.cash)} · CK: ${money(bill.pay.transfer)}`);
  }
  const who = [bill.closedBy && `TN: ${bill.closedBy}`, bill.staff?.length && `Order: ${bill.staff.join(', ')}`].filter(Boolean).join(' · ');
  if (who) lines.push(who);
  return lines.join('\n');
}

export function reportText(r, label) {
  const s = store.settings;
  const lines = [
    `${s.shopName.toUpperCase()} – BÁO CÁO`,
    label,
    HR,
    `Doanh thu: ${money(r.revenue)}`,
    `Số bill: ${r.count} · TB: ${money(r.avg)}`,
    `Tiền mặt: ${money(r.cash)}`,
    `Chuyển khoản: ${money(r.transfer)}`,
  ];
  if (r.discount) lines.push(`Giảm giá: -${money(r.discount)}`);
  if (r.surcharge) lines.push(`Phụ thu: +${money(r.surcharge)}`);
  if (r.cancelled) lines.push(`Bill hủy: ${r.cancelled}`);
  if (r.top.length) {
    lines.push(HR, 'Món bán chạy:');
    r.top.slice(0, 5).forEach((t, i) => lines.push(`${i + 1}. ${t.name} – ${t.qty} phần`));
  }
  lines.push(HR, `Gửi lúc ${fmtDT(Date.now())}`);
  return lines.join('\n');
}

/* ---------- Bản IN 80mm ---------- */
function shopHeader() {
  const s = store.settings;
  const { phone, owner } = shopContact(s);
  return `<div class="r-c"><div class="r-shop">${esc(s.shopName.toUpperCase())}</div>
    ${phone ? `<div>ĐT: ${esc(phone)}</div>` : ''}${owner ? `<div>Chủ quán: ${esc(owner)}</div>` : ''}</div>`;
}
export function billPrintHTML(bill, { draft = false } = {}) {
  const s = store.settings;
  const c = calc(bill);
  const qr = (draft || bill.pay?.method !== 'cash') && s.print.showQR ? vietQR(bill.pay?.method === 'mixed' ? bill.pay.transfer : c.total, qrInfo(bill)) : '';
  return `${shopHeader()}
  <div class="r-c">${esc(s.address || '61k/Xã Hòa Phú,H.Long Hồ,Vĩnh Long')}</div>
  <div class="r-c r-title">${draft ? 'PHIẾU TẠM TÍNH' : 'HÓA ĐƠN THANH TOÁN'}</div>
  ${bill.code ? `<div class="r-c">Số: ${esc(bill.code)}</div>` : ''}
  <div class="r-hr"></div>
  <div class="r-row"><span>${esc(bill.tableName)}</span><span>${fmtDate(bill.closedAt || Date.now())}</span></div>
  <div class="r-row"><span>Giờ vào: ${fmtTime(bill.openedAt)}</span><span>${bill.closedAt ? 'Giờ ra: ' + fmtTime(bill.closedAt) : 'In: ' + fmtTime(Date.now())}</span></div>
  ${bill.closedBy ? `<div>Thu ngân: ${esc(bill.closedBy)}</div>` : ''}
  <div class="r-hr"></div>
  <table class="r-tb"><tbody>
  ${groupItems(c.items).map(it => `<tr><td colspan="3"><b>${esc(it.name)}</b></td></tr>
    <tr><td class="q">${it.qty}</td><td>x ${num(it.price)}</td><td class="m">${num(it.qty * it.price)}</td></tr>
    ${it.note ? `<tr><td></td><td colspan="2" class="r-note">(${esc(it.note)})</td></tr>` : ''}`).join('')}
  </tbody></table>
  <div class="r-hr"></div>
  <div class="r-row"><span>Tạm tính (${c.count} món)</span><span>${num(c.subtotal)}</span></div>
  ${c.discountAmt ? `<div class="r-row"><span>${esc(adjLabel(bill.discount, 'Giảm giá'))}</span><span>-${num(c.discountAmt)}</span></div>` : ''}
  ${c.surchargeAmt ? `<div class="r-row"><span>${esc(adjLabel(bill.surcharge, 'Phụ thu'))}</span><span>+${num(c.surchargeAmt)}</span></div>` : ''}
  <div class="r-hr"></div>
  <div class="r-row r-total"><span>TỔNG CỘNG</span><span>${money(c.total)}</span></div>
  ${bill.pay ? `<div class="r-row"><span>Thanh toán</span><span>${payLabel(bill.pay.method)}</span></div>
    ${bill.pay.method === 'cash' && bill.pay.received ? `<div class="r-row"><span>Khách đưa</span><span>${num(bill.pay.received)}</span></div><div class="r-row"><span>Tiền thối</span><span>${num(Math.max(0, bill.pay.received - c.total))}</span></div>` : ''}
    ${bill.pay.method === 'mixed' ? `<div class="r-row"><span>Tiền mặt</span><span>${num(bill.pay.cash)}</span></div><div class="r-row"><span>Chuyển khoản</span><span>${num(bill.pay.transfer)}</span></div>` : ''}` : ''}
  ${qr ? `<div class="r-c"><img class="r-qr" src="${qr}" alt=""><div>Quét mã để chuyển khoản</div></div>` : ''}
  <div class="r-hr"></div>
  <div class="r-c">${esc(s.print.footer || '')}</div>`;
}
export function kitchenPrintHTML({ tableName, round, items, by, at }) {
  return `<div class="r-c r-title">PHIẾU BẾP${round > 1 ? ` – LẦN ${round}` : ''}</div>
  <div class="r-c r-big">${esc(tableName.toUpperCase())}</div>
  <div class="r-c">${fmtTime(at)} · ${esc(by)}</div>
  <div class="r-hr"></div>
  ${items.map(it => `<div class="r-k-item">${it.qty} x ${esc(it.name)}</div>${it.note ? `<div class="r-k-note">→ ${esc(it.note)}</div>` : ''}`).join('')}
  <div class="r-hr"></div>
  <div class="r-c">Tổng: ${itemCount(items)} món</div>`;
}
export function reportPrintHTML(r, label) {
  return `${shopHeader()}<div class="r-c r-title">BÁO CÁO DOANH THU</div><div class="r-c">${esc(label)}</div><div class="r-hr"></div>
  <div class="r-row r-total"><span>Doanh thu</span><span>${num(r.revenue)}</span></div>
  <div class="r-row"><span>Số bill</span><span>${r.count}</span></div>
  <div class="r-row"><span>Tiền mặt</span><span>${num(r.cash)}</span></div>
  <div class="r-row"><span>Chuyển khoản</span><span>${num(r.transfer)}</span></div>
  <div class="r-row"><span>Giảm giá</span><span>-${num(r.discount)}</span></div>
  <div class="r-row"><span>Phụ thu</span><span>+${num(r.surcharge)}</span></div>
  <div class="r-row"><span>Bill hủy</span><span>${r.cancelled}</span></div>
  <div class="r-hr"></div><b>Món bán chạy</b>
  <table class="r-tb">${r.top.slice(0, 15).map(t => `<tr><td>${esc(t.name)}</td><td class="q">${t.qty}</td><td class="m">${num(t.revenue)}</td></tr>`).join('')}</table>
  <div class="r-hr"></div><div class="r-c">In lúc ${fmtDT(Date.now())}</div>`;
}

export async function printHTML(html) {
  const el = document.getElementById('print-area');
  el.innerHTML = html;
  const imgs = [...el.querySelectorAll('img')];
  await Promise.race([
    Promise.all(imgs.map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))),
    new Promise(r => setTimeout(r, 2500)),
  ]);
  window.print();
}

/* ---------- ẢNH hóa đơn (vẽ canvas – không cần thư viện) ---------- */
export async function textToImage(text, title = '') {
  const W = 600, P = 32, LH = 34;
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  const font = (w, s) => `${w} ${s}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.font = font(500, 22);
  const lines = [];
  for (const raw of text.split('\n')) {
    let cur = '';
    for (const word of raw.split(' ')) {
      const t = cur ? cur + ' ' + word : word;
      if (ctx.measureText(t).width > W - P * 2 && cur) { lines.push(cur); cur = '   ' + word; } else cur = t;
    }
    lines.push(cur);
  }
  const H = P * 2 + 70 + lines.length * LH;
  const dpr = 2;
  cv.width = W * dpr; cv.height = H * dpr; ctx.scale(dpr, dpr);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1F7A4D'; ctx.fillRect(0, 0, W, 8);
  ctx.fillStyle = '#1F7A4D'; ctx.font = font(800, 26); ctx.fillText(title || store.settings.shopName, P, P + 26);
  let y = P + 70;
  lines.forEach((l, i) => {
    const big = /TỔNG CỘNG|Doanh thu/.test(l);
    ctx.font = font(i === 0 || big ? 800 : 500, big ? 26 : 22);
    ctx.fillStyle = big ? '#1F7A4D' : l.startsWith('───') ? '#9aa5a0' : '#16201b';
    ctx.fillText(l, P, y); y += LH;
  });
  return new Promise(r => cv.toBlob(r, 'image/png'));
}
