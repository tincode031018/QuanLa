// ===== O01 / C01 – Sơ đồ bàn (+ bảng điều khiển thu ngân) =====
import { store, billOfTable, tableById } from '../store.js';
import { icon, toast, pickBox, confirmBox, setTitle } from '../ui.js';
import { esc, short, minutesSince, dur } from '../utils.js';
import { calc } from '../bill.js';
import { moveTable, mergeBills } from '../actions.js';

let el, area = localStorage.getItem('ql_area') || 'all', tick, selectedTableId = null, statusFilter = 'all';

function tableCard(t) {
  const b = billOfTable(t);
  const st = b ? (b.status === 'waiting' ? 'waiting' : 'serving') : 'empty';
  const c = b ? calc(b) : null;
  const min = b ? minutesSince(b.openedAt) : 0;
  const long = b && min >= (store.settings.longSitMinutes || 120);
  const isNew = b && store.unseen.has(b.id) && store.user.role === 'cashier';
  return `<div class="tcard st-${st} ${long ? 'long' : ''} ${selectedTableId === t.id ? 'selected' : ''}" data-id="${t.id}">
    ${isNew ? '<span class="new-dot" aria-label="Có cập nhật mới"></span>' : ''}
    <button class="tc-main" aria-label="${esc(t.name)}: ${st === 'empty' ? 'trống' : st === 'waiting' ? 'chờ thanh toán' : 'đang phục vụ'}">
      <span class="tc-top"><span class="tc-name">${esc(t.name)}</span></span>
      <span class="tc-mid">${b ? (c.count ? short(c.total) : 'Mới mở') : 'Trống'}</span>
      <span class="tc-bot">${!b ? 'Sẵn sàng' : st === 'waiting' ? `<b class="text-accent">${icon('cash')} Chờ thanh toán</b>` : `${icon('clock')}${dur(min)} · ${c.count} món`}</span>
    </button>
    ${b ? `<div class="tc-acts">
      <button class="tc-act" data-act="move" data-id="${t.id}" title="Đổi bàn" aria-label="Đổi bàn ${esc(t.name)}">${icon('move')}</button>
      <button class="tc-act" data-act="merge" data-id="${t.id}" title="Ghép bàn" aria-label="Ghép bàn ${esc(t.name)}">${icon('merge')}</button>
    </div>` : ''}
  </div>`;
}

async function doMove(t) {
  const empties = store.tables.filter(x => x.id !== t.id && !billOfTable(x));
  const to = await pickBox({
    title: `Đổi bàn · ${t.name}`,
    items: empties.map(x => ({ label: x.name, sub: store.areas.find(a => a.id === x.areaId)?.name, value: x.id })),
    empty: 'Không còn bàn trống',
  });
  if (!to) return;
  try {
    await moveTable(t.id, to);
    selectedTableId = null;
    toast(`Đã chuyển sang ${tableById(to).name}`);
  } catch (e) { toast(e.message, 'err'); }
}

async function doMerge(t) {
  const source = billOfTable(t);
  if (!source) return;
  const targets = store.tables.filter(x => x.id !== t.id);
  const to = await pickBox({
    title: `Ghép ${source.tableName} vào bàn`,
    items: targets.map(x => ({ label: x.name, sub: billOfTable(x) ? 'Có khách' : 'Bàn trống', value: x.id })),
    empty: 'Không còn bàn khác để ghép',
  });
  if (!to) return;
  const toTable = tableById(to);
  const dstBill = billOfTable(toTable);
  if (!dstBill) {
    try {
      await moveTable(t.id, to);
      selectedTableId = null;
      toast(`Đã chuyển sang ${toTable.name}`);
    } catch (e) { toast(e.message, 'err'); }
    return;
  }
  if (!await confirmBox(`Ghép toàn bộ món của <b>${esc(source.tableName)}</b> vào <b>${esc(toTable.name)}</b>?`)) return;
  try {
    await mergeBills(source.id, dstBill.id, store.user.name);
    localStorage.removeItem('ql_cart_' + t.id);
    selectedTableId = null;
    toast('Đã ghép bàn');
  } catch (e) { toast(e.message || 'Ghép bàn thất bại', 'err'); }
}

function queueHTML() {
  const bills = Object.values(store.bills).sort((a, b) => (a.status === 'waiting' ? 0 : 1) - (b.status === 'waiting' ? 0 : 1) || (a.requestedAt || a.openedAt) - (b.requestedAt || b.openedAt));
  const waiting = bills.filter(b => b.status === 'waiting');
  const paid = store.todayBills.filter(b => b.status === 'paid');
  const revenue = paid.reduce((s, b) => s + (b.total || 0), 0);
  const item = b => {
    const c = calc(b);
    return `<a class="card qcard ${b.status}" href="#/bill/${b.id}">
      <span class="q-tbl">${esc(b.tableName.replace(/^Bàn\s*/i, '') || b.tableName)}</span>
      <span class="grow"><b>${esc(b.tableName)}</b>${store.unseen.has(b.id) ? ' <span class="pill st-cancelled">Mới</span>' : ''}
        <div class="xs muted">${b.status === 'waiting' ? `Yêu cầu lúc ${fmtTime(b.requestedAt)}` : `Vào ${fmtTime(b.openedAt)}`} · ${c.count} món</div></span>
      <span class="q-amt">${money(c.total)}</span></a>`;
  };
  return `<div class="queue">
    <div class="card revenue-card"><div class="small muted">Doanh thu hôm nay</div><div class="rv">${money(revenue)}</div>
      <div class="xs muted">${paid.length} bill đã thanh toán</div></div>
    <div class="section-title" style="margin-top:6px">Chờ thanh toán (${waiting.length})</div>
    ${waiting.length ? waiting.map(item).join('') : `<div class="card empty small" style="padding:18px">Chưa có bàn yêu cầu tính tiền</div>`}
    ${bills.length > waiting.length ? `<div class="section-title">Đang phục vụ (${bills.length - waiting.length})</div>${bills.filter(b => b.status !== 'waiting').map(item).join('')}` : ''}
  </div>`;
}

function render() {
  const isCashier = store.user.role === 'cashier';
  const list = store.tables.filter(t => {
    if (area !== 'all' && t.areaId !== area) return false;
    const b = billOfTable(t);
    const status = b ? (b.status === 'waiting' ? 'waiting' : 'serving') : 'empty';
    return statusFilter === 'all' || status === statusFilter;
  });
  const counts = { empty: 0, serving: 0, waiting: 0 };
  store.tables.forEach(t => { const b = billOfTable(t); counts[b ? (b.status === 'waiting' ? 'waiting' : 'serving') : 'empty']++; });
  const showArea = store.areas.length > 1;
  el.innerHTML = `
    <div class="dash">
      <section>
        <div class="page-head">
          <div class="stats">
            <button type="button" class="stat ${statusFilter === 'empty' ? 'active' : ''}" data-status="empty" aria-pressed="${statusFilter === 'empty'}"><i class="dot d-empty"></i>Trống ${counts.empty}</button>
            <button type="button" class="stat ${statusFilter === 'serving' ? 'active' : ''}" data-status="serving" aria-pressed="${statusFilter === 'serving'}"><i class="dot d-serving"></i>Có khách ${counts.serving}</button>
            <button type="button" class="stat ${statusFilter === 'waiting' ? 'active' : ''}" data-status="waiting" aria-pressed="${statusFilter === 'waiting'}"><i class="dot d-waiting"></i>Đủ món ${counts.waiting}</button>
          </div>
        </div>
        ${showArea ? `<div class="chips mb">
          <button class="chip ${area === 'all' ? 'active' : ''}" data-area="all">Tất cả <span class="cnt">${store.tables.length}</span></button>
          ${store.areas.map(a => `<button class="chip ${area === a.id ? 'active' : ''}" data-area="${a.id}">${esc(a.name)} <span class="cnt">${store.tables.filter(t => t.areaId === a.id).length}</span></button>`).join('')}
        </div>` : ''}
        ${!store.loaded.has('tables') ? '<div class="empty">Đang tải sơ đồ bàn…</div>' :
          list.length ? `<div class="tgrid">${list.map(tableCard).join('')}</div>` :
          `<div class="empty">${icon('grid')}Chưa có bàn${isCashier ? ' – thêm bàn trong <a class="text-brand bold" href="#/admin/tables">Quản lý</a>' : ''}</div>`}
      </section>
    </div>`;
}

export default {
  async mount(root) {
    el = root;
    setTitle('Sơ đồ bàn');
    if (area !== 'all' && !store.areas.some(a => a.id === area)) area = 'all';
    render();
    const onClick = e => {
      const s = e.target.closest('[data-status]');
      if (s) { statusFilter = statusFilter === s.dataset.status ? 'all' : s.dataset.status; selectedTableId = null; return render(); }
      const a = e.target.closest('[data-area]');
      if (a) { area = a.dataset.area; localStorage.setItem('ql_area', area); return render(); }
      const act = e.target.closest('.tc-acts [data-act]');
      if (act) {
        const table = store.tables.find(x => x.id === act.dataset.id);
        if (table) { if (act.dataset.act === 'move') doMove(table); else doMerge(table); }
        return;
      }
      const t = e.target.closest('.tcard');
      if (!t) return;
      if (selectedTableId !== t.dataset.id) { selectedTableId = t.dataset.id; render(); return; }
      const table = store.tables.find(x => x.id === t.dataset.id);
      const b = billOfTable(table);
      if (store.user.role === 'cashier' && b && b.items?.length) location.hash = '#/bill/' + b.id;
      else location.hash = '#/order/' + table.id;
    };
    el.addEventListener('click', onClick);
    tick = setInterval(render, 30000);
    return () => { el.removeEventListener('click', onClick); clearInterval(tick); };
  },
  update(keys) {
    if (selectedTableId && !store.tables.some(t => t.id === selectedTableId)) selectedTableId = null;
    if (['tables', 'bills', 'areas', 'today', 'unseen', 'settings'].some(k => keys.has(k))) render();
  },
};
