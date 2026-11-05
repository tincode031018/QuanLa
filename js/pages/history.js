// ===== C03 – Lịch sử bill =====
import { db } from '../db.js';
import { store } from '../store.js';
import { icon, modal, confirmBox, toast, setTitle } from '../ui.js';
import { esc, money, num, fmtTime, dayKey, addDays, norm } from '../utils.js';
import { calc, groupItems, adjLabel, payLabel, billText, billPrintHTML, printHTML } from '../bill.js?v=1.0.39';
import { shareSheet } from '../zalo.js';

let el, day = dayKey(), status = 'all', q = '', bills = [], deleting = false;
const ST = { paid: 'Đã thanh toán', cancelled: 'Đã hủy', merged: 'Đã gộp' };
const CLOSED_STATUSES = new Set(['paid', 'cancelled', 'merged']);

async function load() {
  const targetDay = day;
  const listEl = el?.querySelector('#hlist');
  if (!listEl) return;
  listEl.innerHTML = '<div class="empty">Đang tải…</div>';
  const deleteButton = el.querySelector('[data-act="delete-day"]');
  if (deleteButton) deleteButton.disabled = true;
  const loaded = await db.list('bills', [['day', '==', targetDay]]);
  if (targetDay !== day || !el?.querySelector('#hlist')) return;
  bills = loaded.sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0));
  renderList();
}

function renderList() {
  const nq = norm(q);
  const list = bills.filter(b => (status === 'all' || b.status === status) && (!nq || norm(`${b.code} ${b.tableName}`).includes(nq)));
  const paid = bills.filter(b => b.status === 'paid');
  const deleteButton = el.querySelector('[data-act="delete-day"]');
  if (deleteButton) deleteButton.disabled = deleting || !bills.some(b => CLOSED_STATUSES.has(b.status));
  el.querySelector('#hsum').innerHTML = `<b>${paid.length}</b> bill · <b class="text-brand">${money(paid.reduce((s, b) => s + (b.total || 0), 0))}</b>`;
  el.querySelector('#hlist').innerHTML = list.length ? `<div class="card">${list.map(b => `
    <div class="hist-item" data-id="${b.id}">
      <span class="avatar" style="border-radius:12px;width:42px;height:42px;background:${b.status === 'paid' ? 'var(--brand)' : 'var(--danger)'}">${icon(b.status === 'paid' ? 'receipt' : 'x')}</span>
      <span class="grow"><b>${esc(b.tableName)}</b> <span class="xs muted">${esc(b.code || '')}</span>
        <div class="xs muted">${fmtTime(b.openedAt)} – ${fmtTime(b.closedAt)} · ${b.status === 'paid' ? payLabel(b.pay?.method) : ST[b.status]} · ${esc(b.closedBy || '')}</div></span>
      <span class="right"><b class="num">${b.status === 'paid' ? money(b.total) : '—'}</b><div><span class="pill st-${b.status}">${ST[b.status]}</span></div></span>
    </div>`).join('')}</div>` : `<div class="card empty">${icon('receipt')}Không có bill</div>`;
}

export function showBill(b) {
  const c = calc(b);
  modal({
    title: `${esc(b.tableName)} · ${esc(b.code || ST[b.status])}`,
    body: `<div class="stack-sm">
      <div class="row wrap"><span class="pill st-${b.status}">${ST[b.status] || b.status}</span><span class="xs muted">Vào ${fmtTime(b.openedAt)} · Ra ${fmtTime(b.closedAt)} · TN: ${esc(b.closedBy || '')} · Order: ${esc((b.staff || []).join(', '))}</span></div>
      ${b.cancelReason ? `<div class="notice warn">${icon('alert')}<div>Lý do hủy: ${esc(b.cancelReason)}</div></div>` : ''}
      <div class="pay-items">${groupItems(c.items).map(i => `<div class="sline"><span class="sq">${i.qty}</span><span class="sn">${esc(i.name)} <span class="xs muted">× ${num(i.price)}</span>${i.note ? `<small>${esc(i.note)}</small>` : ''}</span><span class="sm">${money(i.qty * i.price)}</span></div>`).join('')}
      ${(b.items || []).filter(i => i.void).map(i => `<div class="sline void"><span class="sq">${i.qty}</span><span class="sn">${esc(i.name)}<small>Hủy: ${esc(i.voidReason || '')}</small></span><span class="sm">${money(i.qty * i.price)}</span></div>`).join('')}</div>
      <div class="divider"></div>
      <div class="sum-row"><span>Tạm tính</span><b>${money(c.subtotal)}</b></div>
      ${c.discountAmt ? `<div class="sum-row"><span>${esc(adjLabel(b.discount, 'Giảm giá'))}</span><b>-${money(c.discountAmt)}</b></div>` : ''}
      ${c.surchargeAmt ? `<div class="sum-row"><span>${esc(adjLabel(b.surcharge, 'Phụ thu'))}</span><b>+${money(c.surchargeAmt)}</b></div>` : ''}
      <div class="sum-row total"><span>Tổng cộng</span><b>${money(b.status === 'paid' ? b.total : c.total)}</b></div>
      ${b.pay ? `<div class="sum-row"><span>Thanh toán</span><b>${payLabel(b.pay.method)}</b></div>` : ''}
    </div>`,
    foot: b.status === 'paid' ? `<button class="btn btn-zalo" data-a="zalo">${icon('zalo')} Gửi Zalo</button><button class="btn" data-a="print">${icon('print')} In lại</button>` : '',
    onMount: api => {
      api.$('[data-a="zalo"]')?.addEventListener('click', () => shareSheet(billText(b), { title: 'Hóa đơn ' + b.code, print: () => billPrintHTML(b), imageTitle: 'Hóa đơn' }));
      api.$('[data-a="print"]')?.addEventListener('click', () => printHTML(billPrintHTML(b)));
    },
  });
}

async function deleteDayBills() {
  if (deleting) return;
  const targetDay = day;
  deleting = true;
  const button = el.querySelector('[data-act="delete-day"]');
  if (button) button.disabled = true;
  try {
    const dayBills = (await db.list('bills', [['day', '==', targetDay]])).sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0));
    const closedBills = dayBills.filter(b => CLOSED_STATUSES.has(b.status));
    if (!closedBills.length) {
      if (targetDay === day && el.querySelector('#hlist')) { bills = dayBills; renderList(); }
      toast('Ngày này không có bill đã đóng để xóa', 'info');
      return;
    }
    const confirmed = await confirmBox(
      `Xóa <b>${closedBills.length}</b> bill đã đóng ngày <b>${esc(targetDay)}</b>? Thao tác không thể khôi phục. Bill đang phục vụ hoặc chờ thanh toán sẽ được giữ lại.`,
      { title: 'Xóa dữ liệu bill', okText: 'Xóa bill', danger: true },
    );
    if (!confirmed) {
      if (targetDay === day && el.querySelector('#hlist')) { bills = dayBills; renderList(); }
      return;
    }
    await db.removeMany('bills', closedBills.map(b => b.id));
    if (targetDay === day && el.querySelector('#hlist')) {
      const deleted = new Set(closedBills.map(b => b.id));
      bills = dayBills.filter(b => !deleted.has(b.id));
      renderList();
    }
    toast(`Đã xóa ${closedBills.length} bill ngày ${targetDay}`);
  } catch (error) {
    console.error(error);
    if (targetDay === day && el.querySelector('#hlist')) {
      try { await load(); } catch (refreshError) { console.error(refreshError); }
    }
    toast(/permission/i.test(error?.code || '')
      ? 'Không có quyền xóa bill. Hãy triển khai Firestore Rules mới.'
      : 'Không thể xóa bill. Kiểm tra mạng/quyền và thử lại.', 'err');
  } finally {
    deleting = false;
    const currentButton = el?.querySelector('[data-act="delete-day"]');
    if (currentButton) currentButton.disabled = !bills.some(b => CLOSED_STATUSES.has(b.status));
  }
}

export default {
  async mount(root) {
    el = root; setTitle('Lịch sử bill'); q = '';
    el.innerHTML = `
      <div class="page-head"><div><h1>Lịch sử bill</h1><div class="small" id="hsum"></div></div>
        <button class="btn btn-danger-soft btn-sm" data-act="delete-day" disabled>${icon('trash')} Xóa dữ liệu ngày này</button></div>
      <div class="stack mb">
        <div class="row">
          <button class="icon-btn" data-d="-1" aria-label="Ngày trước">${icon('back')}</button>
          <input class="input" type="date" id="day" value="${day}" style="max-width:190px">
          <button class="icon-btn" data-d="1" aria-label="Ngày sau">${icon('next')}</button>
          <button class="btn btn-sm" data-d="0">Hôm nay</button>
        </div>
        <div class="searchbox">${icon('search')}<input class="input" id="hq" placeholder="Tìm mã bill, tên bàn…"></div>
        <div class="chips">${[['all', 'Tất cả'], ['paid', 'Đã thanh toán'], ['cancelled', 'Đã hủy'], ['merged', 'Đã gộp']].map(([k, l]) => `<button class="chip ${status === k ? 'active' : ''}" data-s="${k}">${l}</button>`).join('')}</div>
      </div>
      <div id="hlist"></div>`;
    const onClick = e => {
      const t = e.target.closest('[data-d],[data-s],[data-id],[data-act]');
      if (!t) return;
      if (t.dataset.act === 'delete-day') { deleteDayBills(); return; }
      if (t.dataset.d !== undefined) { day = +t.dataset.d === 0 ? dayKey() : addDays(day, +t.dataset.d); el.querySelector('#day').value = day; load(); }
      else if (t.dataset.s) { status = t.dataset.s; el.querySelectorAll('[data-s]').forEach(c => c.classList.toggle('active', c === t)); renderList(); }
      else showBill(bills.find(b => b.id === t.dataset.id));
    };
    const onInput = e => {
      if (e.target.id === 'day' && e.target.value) { day = e.target.value; load(); }
      if (e.target.id === 'hq') { q = e.target.value; renderList(); }
    };
    el.addEventListener('click', onClick); el.addEventListener('input', onInput);
    load();
    return () => { el.removeEventListener('click', onClick); el.removeEventListener('input', onInput); };
  },
  update(keys) { if (keys.has('today') && day === dayKey()) { bills = [...store.todayBills].sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0)); renderList(); } },
};
