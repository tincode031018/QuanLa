// ===== O02 / O03 – Gọi món + giỏ món / đơn của bàn =====
import { store, tableById, billOfTable, menuById } from '../store.js';
import { icon, toast, modal, confirmBox, promptBox, pickBox, setTitle } from '../ui.js';
import { esc, money, norm, fmtTime, minutesSince, dur } from '../utils.js';
import { calc, rounds, kitchenText, kitchenPrintHTML, sumItems, itemCount } from '../bill.js';
import { sendItems, requestPayment, reopenBill, moveTable, setAvailable } from '../actions.js';
import { deliver } from '../zalo.js';

let el, tableId, cart = [], cat = 'all', q = '', soldMode = false, sending = false, cartOpen = false;

const cartKey = () => 'ql_cart_' + tableId;
const loadCart = () => { try { cart = JSON.parse(localStorage.getItem(cartKey()) || '[]'); } catch { cart = []; } };
const saveCart = () => { cart.length ? localStorage.setItem(cartKey(), JSON.stringify(cart)) : localStorage.removeItem(cartKey()); };
const qtyOf = menuId => cart.filter(c => c.menuId === menuId).reduce((s, c) => s + c.qty, 0);

function addToCart(menuId, delta = 1) {
  const m = menuById(menuId);
  if (!m) return;
  if (delta > 0 && (m.price == null || m.price <= 0)) {
    if (!m.priceLabel) return toast('Món này chưa có giá bán để tính bill', 'warn');
    const raw = prompt(`Nhập giá bán cho “${m.name}” (${m.priceLabel})`, '');
    if (raw === null) return;
    const price = Number(String(raw).replace(/[^\d]/g, ''));
    if (!Number.isFinite(price) || price <= 0) return toast('Vui lòng nhập giá bán hợp lệ', 'warn');
    cart.push({ key: menuId + '|' + price, menuId, name: m.name, price, qty: delta, note: '' });
    saveCart(); renderMenu(); renderCart(); return;
  }
  if (delta > 0) {
    if (m.available === false) return toast(`${m.name} đã hết`, 'warn');
    const line = cart.find(c => c.menuId === menuId && !c.note);
    if (line) line.qty += delta; else cart.push({ key: menuId + '|', menuId, name: m.name, price: m.price, qty: delta, note: '' });
    navigator.vibrate?.(12);
  } else {
    // giảm dòng gần nhất của món đó
    const idx = cart.map(c => c.menuId).lastIndexOf(menuId);
    if (idx < 0) return;
    cart[idx].qty += delta;
    if (cart[idx].qty <= 0) cart.splice(idx, 1);
  }
  saveCart(); renderMenu(); renderCart();
}

/* ---------- Render ---------- */
function skeleton() {
  el.innerHTML = `<div class="order-page ${soldMode ? 'soldmode' : ''}" id="op">
    <section class="menu-pane">
      <div class="pane-head" id="head"></div>
      <div class="menu-tools">
        <div class="searchbox">${icon('search')}<input class="input" id="q" type="search" placeholder="Tìm món… (gõ không dấu được)" value="${esc(q)}" autocomplete="off"></div>
        <div class="chips" id="cats"></div>
      </div>
      <div id="soldBanner"></div>
      <div class="menu-list" id="menuList"></div>
    </section>
    <aside class="cart-pane ${cartOpen ? 'open' : ''}" id="cartPane"></aside>
    <div class="sheet-backdrop ${cartOpen ? 'open' : ''}" id="backdrop" data-act="closecart"></div>
    <div class="cart-bar" id="cartBar"></div>
  </div>`;
}

function renderHead() {
  const t = tableById(tableId);
  const b = billOfTable(t);
  const st = b ? (b.status === 'waiting' ? `<span class="pill st-waiting">Chờ thanh toán</span>` : `<span class="pill st-open">${icon('clock')} ${dur(minutesSince(b.openedAt))}</span>`) : `<span class="pill">Bàn trống</span>`;
  el.querySelector('#head').innerHTML = `
    <a class="icon-btn" href="#/tables" aria-label="Quay lại">${icon('back')}</a>
    <div class="ph-title"><b>${esc(t?.name || '…')}</b>${st}</div>
    <button class="icon-btn ${soldMode ? 'on' : ''}" data-act="soldmode" title="Báo hết món">${icon('ban')}</button>`;
  setTitle(t ? `Gọi món · ${t.name}` : 'Gọi món');
}

function renderCats() {
  const cats = el.querySelector('#cats');
  const scrollLeft = cats.scrollLeft;
  cats.innerHTML = `<button class="chip ${cat === 'all' ? 'active' : ''}" data-cat="all">Tất cả</button>` +
    store.categories.map(c => `<button class="chip ${cat === c.id ? 'active' : ''}" data-cat="${c.id}">${esc(c.name)}</button>`).join('');
  cats.scrollLeft = scrollLeft;
  el.querySelector('#soldBanner').innerHTML = soldMode
    ? `<div class="notice warn soldmode-banner">${icon('ban')}<div><b>Chế độ báo hết món</b> – chạm vào món để bật/tắt "Hết". <button class="text-brand bold" data-act="soldmode">Xong</button></div></div>` : '';
}

function itemHTML(m) {
  const qn = qtyOf(m.id);
  const sold = m.available === false;
  return `<div class="mitem ${sold ? 'is-sold' : ''} ${qn ? 'in-cart' : ''}" data-act="add" data-id="${m.id}">
    <div class="mi-main"><div class="mi-name">${esc(m.name)}</div>
      <div class="mi-price">${m.price > 0 ? money(m.price) : esc(m.priceLabel || 'Chưa có giá')} ${sold ? '<span class="tag-sold">HẾT</span>' : ''}</div>${m.priceNote ? `<small class="muted">${esc(m.priceNote)}</small>` : ''}</div>
    <div class="mi-ctrl">
      ${qn && !soldMode ? `<button class="sub" data-act="dec" data-id="${m.id}" aria-label="Bớt">${icon('minus')}</button><span class="q">${qn}</span>` : ''}
      ${soldMode ? `<span class="pill ${sold ? 'st-cancelled' : 'st-open'}">${sold ? 'Hết' : 'Còn'}</span>` : `<span class="add" aria-hidden="true">${icon('plus')}</span>`}
    </div></div>`;
}

function renderMenu() {
  const list = el.querySelector('#menuList');
  if (!list) return;
  const nq = norm(q);
  let items = store.menu.filter(m => (cat === 'all' || m.categoryId === cat) && (!nq || norm(m.name).includes(nq)));
  if (!items.length) { list.innerHTML = `<div class="empty">${icon('search')}Không tìm thấy món</div>`; return; }
  if (cat === 'all' && !nq) {
    list.innerHTML = store.categories.map(c => {
      const its = items.filter(m => m.categoryId === c.id);
      return its.length ? `<div class="menu-cat-h">${esc(c.name)}</div>${its.map(itemHTML).join('')}` : '';
    }).join('') + (() => { const rest = items.filter(m => !store.categories.some(c => c.id === m.categoryId)); return rest.length ? `<div class="menu-cat-h">Khác</div>${rest.map(itemHTML).join('')}` : ''; })();
  } else list.innerHTML = items.map(itemHTML).join('');
}

function renderCart() {
  const t = tableById(tableId);
  const b = billOfTable(t);
  const sent = b ? calc(b) : { total: 0, count: 0, subtotal: 0 };
  const newTotal = sumItems(cart), newCount = itemCount(cart);
  const isCashier = store.user.role === 'cashier';
  const pane = el.querySelector('#cartPane');
  pane.innerHTML = `
    <div class="cp-head"><h2>Đơn ${esc(t?.name || '')}</h2>
      ${b ? `<button class="btn btn-sm btn-ghost" data-act="move">${icon('move')} Chuyển bàn</button>` : ''}
      <button class="icon-btn sm only-mobile" data-act="closecart" aria-label="Đóng">${icon('x')}</button></div>
    <div class="cp-body">
      <div class="cp-sec"><span>Món mới · chưa gửi</span>${cart.length ? `<button class="text-danger xs bold" data-act="clear">Xóa hết</button>` : ''}</div>
      ${cart.length ? cart.map((c, i) => `
        <div class="cline">
          <div class="cl-main"><div class="cl-name">${esc(c.name)}</div>
            <button class="cl-note ${c.note ? 'has' : ''}" data-act="note" data-i="${i}">${icon('note')}<span class="ellipsis">${esc(c.note || 'Ghi chú')}</span></button></div>
          <div class="qty"><button data-act="cdec" data-i="${i}" aria-label="Bớt">${icon(c.qty > 1 ? 'minus' : 'trash')}</button><span>${c.qty}</span><button data-act="cinc" data-i="${i}" aria-label="Thêm">${icon('plus')}</button></div>
          <div class="cl-sum">${money(c.qty * c.price)}</div>
        </div>`).join('') : `<div class="muted small" style="padding:10px 2px">Chạm vào món bên ${matchMedia('(min-width:900px)').matches ? 'trái' : 'dưới'} để thêm.</div>`}
      ${b && b.items?.length ? `<div class="cp-sec"><span>Đã gửi bếp</span><span>${sent.count} món</span></div>
        ${rounds(b).map(r => `<div class="round"><div class="round-h"><span>Lần ${r.round} · ${fmtTime(r.at)}</span><span>${esc(r.by || '')}</span></div>
          ${r.items.map(it => `<div class="sline ${it.void ? 'void' : ''}"><span class="sq">${it.qty}</span><span class="sn">${esc(it.name)}${it.note ? `<small>${esc(it.note)}</small>` : ''}${it.void ? `<small>Đã hủy: ${esc(it.voidReason || '')}</small>` : ''}</span><span class="sm">${money(it.qty * it.price)}</span></div>`).join('')}
        </div>`).join('')}` : ''}
    </div>
    <div class="cp-foot">
      ${b ? `<div class="sum-row"><span>Đã gửi</span><b>${money(sent.subtotal)}</b></div>` : ''}
      ${cart.length ? `<div class="sum-row"><span>Món mới (${newCount})</span><b>${money(newTotal)}</b></div>` : ''}
      <div class="sum-row total"><span>Tạm tính</span><b>${money(sent.subtotal + newTotal)}</b></div>
      <button class="btn btn-primary btn-lg btn-block" data-act="send" ${cart.length && !sending ? '' : 'disabled'}>${icon('send')} ${sending ? 'Đang gửi…' : `GỬI BẾP${newCount ? ` (${newCount} món)` : ''}`}</button>
      ${b ? `<div class="btn-row">
        ${b.status === 'waiting' ? `<button class="btn" data-act="reopen">Khách gọi thêm</button>` : `<button class="btn btn-accent" data-act="pay" ${b.items?.length ? '' : 'disabled'}>${icon('receipt')} Tính tiền</button>`}
        ${isCashier ? `<a class="btn btn-dark" href="#/bill/${b.id}">${icon('cash')} Thanh toán</a>` : ''}
      </div>` : ''}
    </div>`;

  // Thanh dưới (điện thoại)
  const bar = el.querySelector('#cartBar');
  if (cart.length) {
    bar.innerHTML = `<button class="cb-info" data-act="opencart"><span class="cb-count">${newCount}</span><span class="cb-text"><b>${money(newTotal)}</b><small>Xem món mới${b ? ` · đã gửi ${sent.count}` : ''}</small></span></button>
      <button class="btn btn-primary" data-act="send" ${sending ? 'disabled' : ''}>${icon('send')} Gửi bếp</button>`;
  } else if (b) {
    bar.innerHTML = `<button class="cb-info" data-act="opencart"><span class="cb-count" style="background:var(--accent)">${sent.count}</span><span class="cb-text"><b>${money(sent.total)}</b><small>Xem đơn của bàn</small></span></button>
      ${b.status === 'waiting' ? `<span class="pill st-waiting" style="align-self:center">Chờ TT</span>` : `<button class="btn btn-accent" data-act="pay" ${b.items?.length ? '' : 'disabled'}>Tính tiền</button>`}`;
  } else bar.innerHTML = `<span class="cb-info"><span class="cb-text"><b>Bàn trống</b><small>Chọn món để mở bàn</small></span></span>`;
}

function setCartOpen(v) {
  cartOpen = v;
  el.querySelector('#cartPane').classList.toggle('open', v);
  el.querySelector('#backdrop').classList.toggle('open', v);
}

/* ---------- Hành động ---------- */
async function send() {
  if (!cart.length || sending) return;
  sending = true; renderCart();
  const by = store.user.name;
  try {
    const res = await sendItems(tableId, cart, by);
    cart = []; saveCart();
    setCartOpen(false);
    toast(`Đã gửi ${itemCount(res.items)} món · ${res.tableName}`);
    const data = { tableName: res.tableName, round: res.round, items: res.items, by, at: res.at };
    deliver('kitchen', kitchenText(data), { title: `Phiếu bếp – ${res.tableName}`, print: () => kitchenPrintHTML(data), autoPrint: store.settings.print.autoKitchen, imageTitle: 'Phiếu bếp' });
  } catch (e) { console.error(e); toast(e.message || 'Gửi thất bại', 'err'); }
  sending = false; renderMenu(); renderCart(); renderHead();
}

async function pay() {
  const b = billOfTable(tableById(tableId));
  if (!b) return;
  if (cart.length && !await confirmBox(`Còn <b>${itemCount(cart)} món chưa gửi bếp</b>. Vẫn yêu cầu tính tiền?`, { okText: 'Vẫn tính tiền' })) return;
  await requestPayment(b.id, store.user.name);
  toast('Đã báo thu ngân tính tiền 💰');
  setCartOpen(false);
  if (store.user.role === 'order') location.hash = '#/tables';
}

async function move() {
  const empties = store.tables.filter(t => t.id !== tableId && !billOfTable(t));
  const to = await pickBox({ title: 'Chuyển sang bàn', items: empties.map(t => ({ label: t.name, sub: store.areas.find(a => a.id === t.areaId)?.name, value: t.id })), empty: 'Không còn bàn trống' });
  if (!to) return;
  try {
    await moveTable(tableId, to);
    toast(`Đã chuyển sang ${tableById(to).name}`);
    location.hash = '#/order/' + to;
  } catch (e) { toast(e.message, 'err'); }
}

async function editNote(i) {
  const c = cart[i];
  const v = await promptBox({ title: `Ghi chú · ${c.name}`, value: c.note, placeholder: 'VD: ít cay, không hành…', chips: store.settings.noteChips || [] });
  if (v === null) return;
  c.note = v;
  // gộp nếu trùng món + ghi chú
  const dup = cart.findIndex((x, j) => j !== i && x.menuId === c.menuId && x.note === c.note);
  if (dup >= 0) { cart[dup].qty += c.qty; cart.splice(i, 1); }
  saveCart(); renderCart();
}

export default {
  focus: true, flush: true,
  async mount(root, [tid]) {
    el = root; tableId = tid; q = ''; soldMode = false; sending = false; cartOpen = false;
    if (!localStorage.getItem('ql_cat_keep')) cat = 'all';
    loadCart();
    skeleton(); renderHead(); renderCats(); renderMenu(); renderCart();

    const onClick = async e => {
      const t = e.target.closest('[data-act],[data-cat]');
      if (!t) return;
      if (t.dataset.cat) { cat = t.dataset.cat; renderCats(); renderMenu(); el.querySelector('.menu-pane').scrollTop = 0; return; }
      const a = t.dataset.act, i = +t.dataset.i;
      switch (a) {
        case 'add':
          if (soldMode) { const m = menuById(t.dataset.id); await setAvailable(m.id, m.available === false); toast(`${m.name}: ${m.available === false ? 'Còn món' : 'Đã hết'}`, 'info'); }
          else addToCart(t.dataset.id, 1);
          break;
        case 'dec': e.stopPropagation(); addToCart(t.dataset.id, -1); break;
        case 'cinc': cart[i].qty++; saveCart(); renderCart(); renderMenu(); break;
        case 'cdec': cart[i].qty--; if (cart[i].qty <= 0) cart.splice(i, 1); saveCart(); renderCart(); renderMenu(); break;
        case 'note': editNote(i); break;
        case 'clear': if (await confirmBox('Xóa tất cả món chưa gửi?', { danger: true, okText: 'Xóa' })) { cart = []; saveCart(); renderCart(); renderMenu(); } break;
        case 'send': send(); break;
        case 'pay': pay(); break;
        case 'reopen': { const b = billOfTable(tableById(tableId)); await reopenBill(b.id); toast('Đã mở lại đơn để gọi thêm'); break; }
        case 'move': move(); break;
        case 'opencart': setCartOpen(true); break;
        case 'closecart': setCartOpen(false); break;
        case 'soldmode': soldMode = !soldMode; el.querySelector('#op').classList.toggle('soldmode', soldMode); renderHead(); renderCats(); renderMenu(); break;
      }
    };
    const onInput = e => { if (e.target.id === 'q') { q = e.target.value; renderMenu(); } };
    el.addEventListener('click', onClick);
    el.addEventListener('input', onInput);
    const tick = setInterval(renderHead, 30000);
    return () => { el.removeEventListener('click', onClick); el.removeEventListener('input', onInput); clearInterval(tick); };
  },
  update(keys) {
    if (!el.querySelector('#op')) return;
    if (keys.has('tables') && !tableById(tableId) && store.loaded.has('tables')) { toast('Bàn không còn tồn tại', 'warn'); location.hash = '#/tables'; return; }
    if (keys.has('menu') || keys.has('categories')) { renderCats(); renderMenu(); }
    if (keys.has('bills') || keys.has('tables') || keys.has('menu')) { renderHead(); renderCart(); }
  },
};
