// ===== Danh sách đơn đang mở (Order: theo dõi · Thu ngân: hàng đợi thanh toán) =====
import { store } from '../store.js';
import { icon, setTitle } from '../ui.js';
import { esc, money, fmtTime, minutesSince, dur } from '../utils.js';
import { calc, groupItems } from '../bill.js';

let el, filter = 'all';

function render() {
  const isCashier = store.user.role === 'cashier';
  const all = Object.values(store.bills).sort((a, b) => (a.status === 'waiting' ? 0 : 1) - (b.status === 'waiting' ? 0 : 1) || (a.requestedAt || a.openedAt) - (b.requestedAt || b.openedAt));
  const list = all.filter(b => filter === 'all' || b.status === filter);
  const cnt = s => all.filter(b => b.status === s).length;
  el.innerHTML = `
    <div class="page-head"><h1>${isCashier ? 'Thu ngân' : 'Đơn đang phục vụ'}</h1></div>
    <div class="chips mb">
      <button class="chip ${filter === 'all' ? 'active' : ''}" data-f="all">Tất cả <span class="cnt">${all.length}</span></button>
      <button class="chip ${filter === 'waiting' ? 'active' : ''}" data-f="waiting">Chờ thanh toán <span class="cnt">${cnt('waiting')}</span></button>
      <button class="chip ${filter === 'open' ? 'active' : ''}" data-f="open">Đang phục vụ <span class="cnt">${cnt('open')}</span></button>
    </div>
    ${list.length ? `<div class="orders-grid">${list.map(b => {
      const c = calc(b);
      const g = groupItems(c.items);
      return `<div class="card card-pad order-pay-card ${b.status === 'waiting' ? 'waiting' : ''}">
        <div class="row-between"><div class="row"><b style="font-size:17px">${esc(b.tableName)}</b>
          <span class="pill st-${b.status}">${b.status === 'waiting' ? 'Chờ thanh toán' : 'Đang phục vụ'}</span>
          ${isCashier && store.unseen.has(b.id) ? '<span class="pill st-cancelled">Mới</span>' : ''}</div></div>
        <div class="xs muted">Vào ${fmtTime(b.openedAt)} · ${dur(minutesSince(b.openedAt))} · ${esc((b.staff || []).join(', '))}</div>
        <div class="small order-card-items" style="min-height:40px">${g.slice(0, 5).map(i => `${i.qty}× ${esc(i.name)}`).join(' · ') || '<span class="muted">Chưa có món</span>'}${g.length > 5 ? ` <span class="muted">+${g.length - 5} món</span>` : ''}</div>
        <div class="order-card-foot">
          <div class="row-between order-card-total">
            <span class="xs muted">Tổng tiền</span>
            <b class="num" style="font-size:18px">${money(c.total)}</b>
          </div>
          <div class="btn-row order-card-actions">
            <a class="btn btn-sm" href="#/order/${b.tableId}">${icon('plus')} Gọi món</a>
            ${isCashier ? `<a class="btn btn-sm ${b.status === 'waiting' ? 'btn-accent' : 'btn-primary'}" href="#/bill/${b.id}">${icon('cash')} Thanh toán</a>` : ''}
          </div>
        </div>
      </div>`;
    }).join('')}</div>` : `<div class="card empty">${icon('list')}<div>Không có đơn nào</div></div>`}`;
}

export default {
  async mount(root) {
    el = root; setTitle(store.user.role === 'cashier' ? 'Thu ngân' : 'Đơn');
    render();
    const onClick = e => { const f = e.target.closest('[data-f]'); if (f) { filter = f.dataset.f; render(); } };
    el.addEventListener('click', onClick);
    const t = setInterval(render, 30000);
    return () => { el.removeEventListener('click', onClick); clearInterval(t); };
  },
  update(keys) { if (keys.has('bills') || keys.has('unseen')) render(); },
};
