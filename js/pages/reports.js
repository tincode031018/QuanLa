// ===== C04 – Báo cáo doanh thu =====
import { db } from '../db.js';
import { icon, setTitle, toast } from '../ui.js';
import { esc, money, short, dayKey, addDays, fmtDay, download, fmtDT } from '../utils.js';
import { reportText, reportPrintHTML, printHTML, liveItems, payLabel } from '../bill.js';
import { deliver } from '../zalo.js';

let el, range = 'today', from = dayKey(), to = dayKey(), data = null;

function setRange(r) {
  range = r;
  const t = dayKey();
  if (r === 'today') from = to = t;
  else if (r === 'yesterday') from = to = addDays(t, -1);
  else if (r === '7d') { from = addDays(t, -6); to = t; }
  else if (r === 'month') { from = t.slice(0, 8) + '01'; to = t; }
}
const label = () => (from === to ? fmtDay(from) : `${fmtDay(from)} – ${fmtDay(to)}`);

function compute(bills) {
  const paid = bills.filter(b => b.status === 'paid');
  const r = { revenue: 0, count: paid.length, cash: 0, transfer: 0, discount: 0, surcharge: 0, items: 0, cancelled: bills.filter(b => b.status === 'cancelled').length, top: [], byKey: {}, byStaff: {}, byCashier: {}, bills: paid };
  const top = {};
  for (const b of paid) {
    r.revenue += b.total || 0;
    r.cash += b.pay?.cash || 0;
    r.transfer += b.pay?.transfer || 0;
    r.discount += b.discountAmt || 0;
    r.surcharge += b.surchargeAmt || 0;
    const k = from === to ? new Date(b.closedAt).getHours() : b.day;
    r.byKey[k] = (r.byKey[k] || 0) + (b.total || 0);
    if (b.closedBy) r.byCashier[b.closedBy] = (r.byCashier[b.closedBy] || 0) + (b.total || 0);
    for (const it of liveItems(b)) {
      r.items += it.qty;
      const t = (top[it.name] ||= { name: it.name, qty: 0, revenue: 0 });
      t.qty += it.qty; t.revenue += it.qty * it.price;
      if (it.by) r.byStaff[it.by] = (r.byStaff[it.by] || 0) + it.qty;
    }
  }
  r.avg = r.count ? r.revenue / r.count : 0;
  r.top = Object.values(top).sort((a, b) => b.qty - a.qty);
  return r;
}

function chart(r) {
  let keys;
  if (from === to) { const hs = Object.keys(r.byKey).map(Number); const lo = Math.min(8, ...hs), hi = Math.max(22, ...hs); keys = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i); }
  else { keys = []; for (let d = from; d <= to && keys.length < 62; d = addDays(d, 1)) keys.push(d); }
  const max = Math.max(1, ...keys.map(k => r.byKey[k] || 0));
  return `<div class="vbars">${keys.map(k => {
    const v = r.byKey[k] || 0;
    const lb = from === to ? k + 'h' : k.slice(8, 10);
    return `<div class="vb" title="${from === to ? k + 'h' : fmtDay(k)}: ${money(v)}"><i style="height:${(v / max) * 100}%"></i><span>${lb}</span></div>`;
  }).join('')}</div>`;
}

function render() {
  const r = data;
  const body = el.querySelector('#rbody');
  if (!r) { body.innerHTML = '<div class="empty">Đang tải…</div>'; return; }
  const maxTop = Math.max(1, ...r.top.map(t => t.qty));
  const staff = Object.entries(r.byStaff).sort((a, b) => b[1] - a[1]);
  const cashiers = Object.entries(r.byCashier).sort((a, b) => b[1] - a[1]);
  body.innerHTML = `
    <div class="kpis">
      <div class="card kpi hl"><div class="k-label">Doanh thu</div><div class="k-val">${money(r.revenue)}</div><div class="k-sub">${label()}</div></div>
      <div class="card kpi"><div class="k-label">Số bill</div><div class="k-val">${r.count}</div><div class="k-sub">TB ${money(r.avg)}/bill</div></div>
      <div class="card kpi"><div class="k-label">Tiền mặt</div><div class="k-val">${money(r.cash)}</div><div class="k-sub">${r.revenue ? Math.round(r.cash / r.revenue * 100) : 0}%</div></div>
      <div class="card kpi"><div class="k-label">Chuyển khoản</div><div class="k-val">${money(r.transfer)}</div><div class="k-sub">${r.revenue ? Math.round(r.transfer / r.revenue * 100) : 0}%</div></div>
      <div class="card kpi"><div class="k-label">Số món bán</div><div class="k-val">${r.items}</div></div>
      <div class="card kpi"><div class="k-label">Giảm giá</div><div class="k-val text-danger">-${short(r.discount)}</div></div>
      <div class="card kpi"><div class="k-label">Phụ thu</div><div class="k-val">+${short(r.surcharge)}</div></div>
      <div class="card kpi"><div class="k-label">Bill hủy</div><div class="k-val">${r.cancelled}</div></div>
    </div>
    <div class="settings-grid mt">
      <div class="card card-pad"><h3>Doanh thu theo ${from === to ? 'giờ' : 'ngày'}</h3>${chart(r)}</div>
      <div class="card card-pad"><h3>Món bán chạy</h3>
        ${r.top.length ? r.top.slice(0, 10).map((t, i) => `<div class="hbar"><span><b>${i + 1}.</b> ${esc(t.name)}</span><span class="small"><b>${t.qty}</b> · ${short(t.revenue)}</span><div class="track"><div class="fill" style="width:${t.qty / maxTop * 100}%"></div></div></div>`).join('') : '<div class="empty small">Chưa có dữ liệu</div>'}
      </div>
      <div class="card card-pad"><h3>Nhân viên Order (số món)</h3>
        ${staff.length ? staff.map(([n, v]) => `<div class="row-between" style="padding:8px 0;border-bottom:1px dashed var(--line)"><span>${esc(n)}</span><b>${v} món</b></div>`).join('') : '<div class="empty small">Chưa có dữ liệu</div>'}
      </div>
      <div class="card card-pad"><h3>Thu ngân (doanh thu)</h3>
        ${cashiers.length ? cashiers.map(([n, v]) => `<div class="row-between" style="padding:8px 0;border-bottom:1px dashed var(--line)"><span>${esc(n)}</span><b>${money(v)}</b></div>`).join('') : '<div class="empty small">Chưa có dữ liệu</div>'}
      </div>
    </div>`;
}

async function load() {
  data = null; render();
  const bills = await db.list('bills', [['day', '>=', from], ['day', '<=', to]]);
  data = compute(bills); render();
}

function exportCSV() {
  if (!data) return;
  const rows = [['Mã', 'Ngày', 'Giờ đóng', 'Bàn', 'Tạm tính', 'Giảm giá', 'Phụ thu', 'Tổng', 'Hình thức', 'Tiền mặt', 'Chuyển khoản', 'Thu ngân', 'Order']];
  for (const b of data.bills) rows.push([b.code, b.day, fmtDT(b.closedAt), b.tableName, b.subtotal, b.discountAmt, b.surchargeAmt, b.total, payLabel(b.pay?.method), b.pay?.cash || 0, b.pay?.transfer || 0, b.closedBy, (b.staff || []).join(' ')]);
  const csv = '\ufeff' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  download(`bao-cao-${from}_${to}.csv`, csv, 'text/csv;charset=utf-8');
}

export default {
  async mount(root) {
    el = root; setTitle('Báo cáo');
    el.innerHTML = `
      <div class="page-head"><h1>Báo cáo</h1>
        <div class="row wrap">
          <button class="btn btn-sm btn-zalo" data-a="zalo">${icon('zalo')} Gửi Zalo</button>
          <button class="btn btn-sm" data-a="print">${icon('print')} In</button>
          <button class="btn btn-sm" data-a="csv">${icon('download')} Excel (CSV)</button>
        </div></div>
      <div class="chips mb">${[['today', 'Hôm nay'], ['yesterday', 'Hôm qua'], ['7d', '7 ngày'], ['month', 'Tháng này'], ['custom', 'Tùy chọn']].map(([k, l]) => `<button class="chip ${range === k ? 'active' : ''}" data-r="${k}">${l}</button>`).join('')}</div>
      <div class="row mb ${range === 'custom' ? '' : 'hidden'}" id="custom"><input class="input" type="date" id="from" value="${from}"><span>→</span><input class="input" type="date" id="to" value="${to}"></div>
      <div id="rbody"></div>`;
    const onClick = e => {
      const t = e.target.closest('[data-r],[data-a]');
      if (!t) return;
      if (t.dataset.r) {
        el.querySelectorAll('[data-r]').forEach(c => c.classList.toggle('active', c === t));
        el.querySelector('#custom').classList.toggle('hidden', t.dataset.r !== 'custom');
        if (t.dataset.r !== 'custom') { setRange(t.dataset.r); load(); } else range = 'custom';
      } else if (t.dataset.a === 'zalo') { if (data) deliver('report', reportText(data, label()), { title: 'Báo cáo ' + label(), print: () => reportPrintHTML(data, label()), imageTitle: 'Báo cáo' }); }
      else if (t.dataset.a === 'print') { if (data) printHTML(reportPrintHTML(data, label())); }
      else if (t.dataset.a === 'csv') { exportCSV(); toast('Đã xuất file CSV (mở bằng Excel)'); }
    };
    const onInput = e => {
      if (e.target.id === 'from' || e.target.id === 'to') {
        from = el.querySelector('#from').value || from; to = el.querySelector('#to').value || to;
        if (from > to) [from, to] = [to, from];
        load();
      }
    };
    el.addEventListener('click', onClick); el.addEventListener('input', onInput);
    if (range !== 'custom') setRange(range);
    load();
    return () => { el.removeEventListener('click', onClick); el.removeEventListener('input', onInput); };
  },
  update(keys) { if (keys.has('today') && to === dayKey()) load(); },
};
