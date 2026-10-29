// ===== C02 – Chi tiết bill & thanh toán (giảm giá, phụ thu, tiền mặt / QR chuyển khoản) =====
import { store, emit } from '../store.js';
import { icon, toast, modal, confirmBox, promptBox, pickBox, setTitle } from '../ui.js';
import { esc, money, num, parseMoney, fmtTime, debounce } from '../utils.js';
import { calc, rounds, adjLabel, vietQR, qrInfo, bankName, billText, billPrintHTML, printHTML, kitchenText, payLabel } from '../bill.js?v=1.0.38';
import { voidItem, saveAdjust, completePayment, cancelBill, mergeBills, moveTable, reopenBill } from '../actions.js';
import { deliver, shareSheet, autoReady } from '../zalo.js';

let el, billId, draft, done = false;

const bill = () => store.bills[billId];
const totals = () => calc(bill(), draft.discount, draft.surcharge);
const persist = debounce(() => { if (bill()) saveAdjust(billId, draft.discount, draft.surcharge); }, 500);

function initDraft(b) {
  const subtotal = calc(b, null, null).subtotal;
  const toPercent = adj => {
    if (!adj) return null;
    const value = adj.type === 'percent' ? adj.value : subtotal ? Math.round(adj.value / subtotal * 100 * 1000000) / 1000000 : 0;
    return { ...adj, type: 'percent', value };
  };
  const discount = toPercent(b.discount);
  const surcharge = toPercent(b.surcharge);
  draft = {
    discount,
    discountEnabled: !!discount,
    surcharge,
    surchargeEnabled: !!surcharge,
    method: 'cash',
    received: 0,
    cashPart: 0,
  };
}

/* ---------- Khung trang ---------- */
function skeleton() {
  const b = bill();
  el.innerHTML = `<div class="pay-page">
    <div class="pane-head">
      <a class="icon-btn" href="#/tables" aria-label="Quay lại">${icon('back')}</a>
      <div class="ph-title"><b>${esc(b.tableName)}</b><span class="pill st-${b.status}">${b.status === 'waiting' ? 'Chờ thanh toán' : 'Đang phục vụ'}</span>
        <span class="xs muted">Vào ${fmtTime(b.openedAt)} · ${esc((b.staff || []).join(', '))}</span></div>
      <button class="icon-btn" data-act="more" aria-label="Thêm thao tác">${icon('settings')}</button>
    </div>
    <div class="pay-grid">
      <section class="stack">
        <div class="card"><div class="card-h"><h3>Danh sách món</h3><a class="btn btn-sm btn-soft" href="#/order/${b.tableId}">${icon('plus')} Thêm món</a></div>
          <div class="card-pad pay-items" id="items"></div></div>
        <div class="btn-row wrap">
          <button class="btn" data-act="printDraft">${icon('print')} In tính tiền</button>
          <button class="btn" data-act="zaloDraft">${icon('zalo')} Gửi tính tiền</button>
        </div>
      </section>
      <section class="stack pay-side">
        <div class="card card-pad stack-sm pay-summary-card">
          <div id="adjust"></div>
          <div class="divider" style="margin:4px 0"></div>
          <div id="sum" class="stack-sm"></div>
        </div>
        <div class="card card-pad stack-sm" id="method"></div>
        <button class="btn btn-primary btn-block" data-act="complete" id="completeBtn">${icon('check')} HOÀN TẤT THANH TOÁN</button>
      </section>
    </div>
  </div>`;
  setTitle('Thanh toán · ' + b.tableName);
}

function renderItems() {
  const b = bill();
  const box = el.querySelector('#items');
  if (!b.items?.length) { box.innerHTML = `<div class="empty small">Chưa có món</div>`; return; }
  box.innerHTML = rounds(b).map(r => `
    <div class="xs muted bold" style="margin-top:6px">LẦN ${r.round} · ${fmtTime(r.at)} · ${esc(r.by || '')}</div>
    ${r.items.map(it => `<div class="sline ${it.void ? 'void' : ''}">
      <span class="sq">${it.qty}</span>
      <span class="sn"><b style="font-weight:650">${esc(it.name)}</b> <span class="xs muted">× ${num(it.price)}</span>
        ${it.note ? `<small>${esc(it.note)}</small>` : ''}${it.void ? `<small>Hủy: ${esc(it.voidReason || '')} (${esc(it.voidBy || '')})</small>` : ''}</span>
      <span class="sm">${money(it.qty * it.price)}</span>
      ${it.void ? '<span style="width:34px"></span>' : `<button class="icon-btn sm danger" data-act="void" data-id="${it.id}" aria-label="Hủy món">${icon('x')}</button>`}
    </div>`).join('')}`).join('');
}

function renderAdjust() {
  const d = draft.discount, sc = draft.surcharge;
  el.querySelector('#adjust').innerHTML = `
    <div class="adjust-grid">
      <div class="adjust-box">
        <div class="row-between">
          <span class="adjust-title">${icon('tag')} Giảm giá</span>
          <label class="adjust-toggle"><input type="checkbox" data-adjust="discount" ${draft.discountEnabled ? 'checked' : ''}> Bật</label>
        </div>
        <input class="input adjust-percent" id="discVal" type="number" min="0" max="100" step="any" inputmode="decimal" placeholder="%" value="${d?.value || ''}" ${draft.discountEnabled ? '' : 'disabled'}>
      </div>
      <div class="adjust-box">
        <div class="row-between">
          <span class="adjust-title">${icon('plus')} Phụ thu</span>
          <label class="adjust-toggle"><input type="checkbox" data-adjust="surcharge" ${draft.surchargeEnabled ? 'checked' : ''}> Bật</label>
        </div>
        <input class="input adjust-percent" id="surVal" type="number" min="0" max="100" step="any" inputmode="decimal" placeholder="%" value="${sc?.value || ''}" ${draft.surchargeEnabled ? '' : 'disabled'}>
      </div>
    </div>`;
}

function renderSum() {
  const c = totals();
  el.querySelector('#sum').innerHTML = `
    <div class="sum-row"><span>Tạm tính (${c.count} món)</span><b>${money(c.subtotal)}</b></div>
    ${c.discountAmt ? `<div class="sum-row"><span>${esc(adjLabel(draft.discount, 'Giảm giá'))}</span><b class="text-danger">-${money(c.discountAmt)}</b></div>` : ''}
    ${c.surchargeAmt ? `<div class="sum-row"><span>${esc(adjLabel(draft.surcharge, 'Phụ thu'))}</span><b>+${money(c.surchargeAmt)}</b></div>` : ''}
    <div class="total-box"><span class="bold">TỔNG CỘNG</span><span class="tb-val">${money(c.total)}</span></div>`;
  updateDynamic();
}

function renderMethod() {
  const m = draft.method;
  const box = el.querySelector('#method');
  box.innerHTML = `
    <h3>Hình thức thanh toán</h3>
    <div class="seg">
      <button class="${m === 'cash' ? 'active' : ''}" data-m="cash">Tiền mặt</button>
      <button class="${m === 'transfer' ? 'active' : ''}" data-m="transfer">Chuyển khoản</button>
      <button class="${m === 'mixed' ? 'active' : ''}" data-m="mixed">Kết hợp</button>
    </div>
    ${m === 'cash' ? `
      <label class="field"><span>Khách đưa</span><input class="input money" id="received" inputmode="numeric" placeholder="Bỏ trống = đưa đủ" value="${draft.received ? num(draft.received) : ''}"></label>
      <div class="change-box" id="change"></div>` : ''}
    ${m === 'mixed' ? `<label class="field"><span>Phần trả tiền mặt</span><input class="input money" id="cashPart" inputmode="numeric" placeholder="0" value="${draft.cashPart ? num(draft.cashPart) : ''}"></label>
      <div class="change-box" id="change"></div>` : ''}
    ${m !== 'cash' ? `<div class="qr-box" id="qr"></div>` : ''}`;
  updateDynamic();
}

// Cập nhật phần phụ thuộc tổng tiền mà không vẽ lại ô nhập
function updateDynamic() {
  const c = totals();
  const m = draft.method;
  const ch = el.querySelector('#change');
  if (ch && m === 'cash') {
    const rec = draft.received || c.total, diff = rec - c.total;
    ch.className = 'change-box' + (diff < 0 ? ' neg' : '');
    ch.innerHTML = diff < 0 ? `<span>Còn thiếu</span><b>${money(-diff)}</b>` : `<span>Tiền thối lại</span><b>${money(diff)}</b>`;
  }
  if (ch && m === 'mixed') {
    const rest = c.total - draft.cashPart;
    ch.className = 'change-box' + (rest < 0 ? ' neg' : '');
    ch.innerHTML = `<span>Chuyển khoản</span><b>${money(Math.max(0, rest))}</b>`;
  }
  const qr = el.querySelector('#qr');
  if (qr) {
    const amt = m === 'mixed' ? Math.max(0, c.total - draft.cashPart) : c.total;
    const b = bill(), bk = store.settings.bank;
    const url = vietQR(amt, qrInfo(b));
    qr.innerHTML = url ? `<img src="${url}" alt="Mã QR chuyển khoản" loading="lazy">
      <div class="bold" style="font-size:20px">${money(amt)}</div>
      <div class="small">${esc(bankName(bk.bin))} · <b>${esc(bk.accountNo)}</b><br>${esc(bk.accountName)}</div>
      <div class="xs" style="color:#666">Nội dung: ${esc(qrInfo(b))}</div>`
      : `<div class="notice warn" style="text-align:left">${icon('alert')}<div>Chưa cài tài khoản ngân hàng. <a class="text-brand bold" href="#/admin/settings">Cài đặt ngay</a></div></div>`;
  }
  const btn = el.querySelector('#completeBtn');
  if (btn) btn.disabled = !c.count;
}

/* ---------- Hành động ---------- */
async function doVoid(itemId) {
  const it = bill().items.find(i => i.id === itemId);
  let q = it.qty;
  const s = store.settings;
  const m = modal({
    title: `Hủy món · ${esc(it.name)}`,
    body: `${it.qty > 1 ? `<div class="row-between"><span class="label">Số lượng hủy</span><div class="qty"><button data-q="-1">${icon('minus')}</button><span id="vq">${q}</span><button data-q="1">${icon('plus')}</button></div></div>` : ''}
      <label class="field mt"><span>Lý do (bắt buộc)</span><input class="input" id="vr" placeholder="Nhập lý do"></label>
      <div class="chips wrap mt">${s.voidReasons.map(r => `<button class="chip chip-sm" data-r="${esc(r)}">${esc(r)}</button>`).join('')}</div>`,
    foot: `<button class="btn" data-close>Đóng</button><button class="btn btn-danger" data-ok>Hủy món</button>`,
    onMount: api => {
      api.el.addEventListener('click', e => {
        const b = e.target.closest('[data-q],[data-r]');
        if (b?.dataset.q) { q = Math.min(it.qty, Math.max(1, q + +b.dataset.q)); api.$('#vq').textContent = q; }
        if (b?.dataset.r) api.$('#vr').value = b.dataset.r;
      });
      api.$('[data-ok]').onclick = () => { const r = api.$('#vr').value.trim(); if (!r) { api.$('#vr').focus(); return toast('Nhập lý do hủy', 'warn'); } api.close({ q, r }); };
    },
  });
  const res = await m.result;
  if (!res) return;
  await voidItem(billId, itemId, res.q, res.r, store.user.name);
  toast(`Đã hủy ${res.q} ${it.name}`);
  const b = bill();
  deliver('kitchen', kitchenText({ tableName: b.tableName, items: [{ ...it, qty: res.q }], by: store.user.name, at: Date.now(), cancel: true, reason: res.r }), { title: 'Báo hủy món cho bếp' });
}

function payPayload() {
  const c = totals();
  const m = draft.method;
  if (m === 'cash') {
    const received = draft.received || c.total;
    if (received < c.total) throw new Error('Khách đưa chưa đủ tiền');
    return { method: 'cash', received, cash: c.total, transfer: 0, change: received - c.total };
  }
  if (m === 'transfer') return { method: 'transfer', cash: 0, transfer: c.total };
  if (draft.cashPart <= 0 || draft.cashPart >= c.total) throw new Error('Phần tiền mặt phải lớn hơn 0 và nhỏ hơn tổng');
  return { method: 'mixed', cash: draft.cashPart, transfer: c.total - draft.cashPart };
}

async function complete() {
  let pay;
  try { pay = payPayload(); } catch (e) { return toast(e.message, 'warn'); }
  const c = totals();
  if (!await confirmBox(`Xác nhận thu <b>${money(c.total)}</b> (${payLabel(pay.method)}) cho <b>${esc(bill().tableName)}</b>?`, { okText: 'Thu tiền', title: 'Hoàn tất thanh toán' })) return;
  const btn = el.querySelector('#completeBtn'); btn.disabled = true;
  try {
    done = true;
    const closed = await completePayment(billId, { discount: draft.discount, surcharge: draft.surcharge, pay }, store.user.name);
    const s = store.settings;
    const text = billText(closed);
    if (s.print.autoBill) printHTML(billPrintHTML(closed));
    let autoSent = false;
    if (s.zalo.sendBill && autoReady()) autoSent = await deliver('bill', text, { title: 'Hóa đơn ' + closed.code });
    successModal(closed, text, autoSent);
    location.hash = '#/tables';
  } catch (e) { done = false; btn.disabled = false; toast(e.message || 'Thanh toán thất bại', 'err'); }
}

function successModal(b, text, autoSent) {
  modal({
    title: '',
    body: `<div class="center stack-sm" style="padding:6px 0 4px">
      <div style="width:64px;height:64px;border-radius:50%;background:var(--brand-50);color:var(--brand);display:grid;place-items:center;margin:0 auto">${icon('check').replace('class="i ', 'style="width:34px;height:34px;stroke-width:2.5" class="i ')}</div>
      <h2>Thanh toán thành công</h2>
      <div class="muted small">${esc(b.code)} · ${esc(b.tableName)} · ${payLabel(b.pay.method)}</div>
      <div style="font-size:30px;font-weight:850;color:var(--brand)" class="num">${money(b.total)}</div>
      ${b.pay.change ? `<div class="change-box"><span>Tiền thối</span><b>${money(b.pay.change)}</b></div>` : ''}
      ${autoSent ? `<div class="pill st-open" style="margin:4px auto">${icon('check')} Đã gửi nhóm Zalo</div>` : ''}
    </div>`,
    foot: `<button class="btn btn-zalo" data-a="zalo">${icon('zalo')} ${autoSent ? 'Gửi lại' : 'Gửi Zalo'}</button>
      <button class="btn" data-a="print">${icon('print')} In hóa đơn</button>
      <button class="btn btn-primary" data-close>Xong</button>`,
    onMount: api => {
      api.$('[data-a="zalo"]').onclick = () => shareSheet(text, { title: 'Hóa đơn ' + b.code, print: () => billPrintHTML(b), imageTitle: 'Hóa đơn' });
      api.$('[data-a="print"]').onclick = () => printHTML(billPrintHTML(b));
    },
  });
}

async function more() {
  const b = bill();
  const items = [
    { label: 'Chuyển bàn', sub: 'Sang bàn trống', value: 'move', icon: icon('move') },
    { label: 'Gộp bàn', sub: 'Gộp bill này vào bàn khác', value: 'merge', icon: icon('merge') },
    ...(b.status === 'waiting' ? [{ label: 'Mở lại đơn', sub: 'Khách gọi thêm', value: 'reopen', icon: icon('list') }] : []),
    { label: 'Hủy bill', sub: 'Bắt buộc ghi lý do', value: 'cancel', icon: icon('trash') },
  ];
  const a = await pickBox({ title: 'Thao tác khác', items });
  if (!a) return;
  if (a === 'move') {
    const to = await pickBox({ title: 'Chuyển sang bàn', items: store.tables.filter(t => !t.billId || !store.bills[t.billId]).map(t => ({ label: t.name, value: t.id })), empty: 'Không còn bàn trống' });
    if (to) { try { await moveTable(b.tableId, to); toast('Đã chuyển bàn'); } catch (e) { toast(e.message, 'err'); } }
  } else if (a === 'merge') {
    const others = Object.values(store.bills).filter(x => x.id !== billId);
    const dst = await pickBox({ title: `Gộp ${b.tableName} vào…`, items: others.map(x => ({ label: x.tableName, sub: money(calc(x).total), value: x.id })), empty: 'Không có bàn nào khác đang phục vụ' });
    if (dst && await confirmBox(`Gộp toàn bộ món của <b>${esc(b.tableName)}</b> vào <b>${esc(store.bills[dst].tableName)}</b>?`)) {
      done = true;
      await mergeBills(billId, dst, store.user.name);
      toast('Đã gộp bàn'); location.hash = '#/bill/' + dst;
    }
  } else if (a === 'reopen') { await reopenBill(billId); toast('Đã mở lại đơn'); }
  else if (a === 'cancel') {
    const r = await promptBox({ title: 'Hủy bill · ' + b.tableName, label: 'Lý do hủy', chips: ['Khách bỏ về', 'Nhập nhầm bàn', 'Mời khách'], required: true, okText: 'Hủy bill' });
    if (r) {
      done = true;
      await cancelBill(billId, r, store.user.name);
      toast('Đã hủy bill', 'warn');
      deliver('kitchen', `HỦY BÀN – ${b.tableName.toUpperCase()}\nLý do: ${r}\n${store.user.name}`, { title: 'Báo bếp hủy bàn' });
      location.hash = '#/tables';
    }
  }
}

/* ---------- Mount ---------- */
function notActive() {
  el.innerHTML = `<div class="pay-page"><div class="pane-head"><a class="icon-btn" href="#/tables">${icon('back')}</a><div class="ph-title"><b>Bill</b></div></div>
    <div class="empty">${icon('receipt')}<h2>Bill không còn hoạt động</h2><p class="small mt">Bill này đã được thanh toán, hủy hoặc gộp.</p>
    <div class="row mt" style="justify-content:center"><a class="btn" href="#/history">Xem lịch sử</a><a class="btn btn-primary" href="#/tables">Về sơ đồ bàn</a></div></div></div>`;
}

export default {
  focus: true, flush: true,
  async mount(root, [id]) {
    el = root; billId = id; done = false;
    const b = bill();
    if (!b) { if (store.loaded.has('bills')) notActive(); else el.innerHTML = '<div class="empty">Đang tải…</div>'; draft = null; }
    else { initDraft(b); skeleton(); renderItems(); renderAdjust(); renderMethod(); renderSum(); }
    store.unseen.delete(billId); emit('unseen');

    const onClick = async e => {
      const t = e.target.closest('[data-act],[data-m]');
      if (!t || !bill()) return;
      const ds = t.dataset;
      if (ds.m) { draft.method = ds.m; renderMethod(); }
      else switch (ds.act) {
        case 'void': doVoid(ds.id); break;
        case 'complete': complete(); break;
        case 'more': more(); break;
        case 'printDraft': printHTML(billPrintHTML({ ...bill(), discount: draft.discount, surcharge: draft.surcharge }, { draft: true })); break;
        case 'zaloDraft': shareSheet(billText({ ...bill(), discount: draft.discount, surcharge: draft.surcharge }, { draft: true }), { title: 'Tạm tính ' + bill().tableName }); break;
      }
    };
    const fmtInput = inp => { const v = parseMoney(inp.value); inp.value = v ? num(v) : ''; return v; };
    const onChange = e => {
      const t = e.target;
      if (t.dataset.adjust === 'discount') {
        draft.discountEnabled = t.checked;
        draft.discount = t.checked ? { ...(draft.discount || {}), label: 'Giảm giá', type: 'percent', value: draft.discount?.value || 0 } : null;
      } else if (t.dataset.adjust === 'surcharge') {
        draft.surchargeEnabled = t.checked;
        draft.surcharge = t.checked ? { ...(draft.surcharge || {}), label: 'Phụ thu', type: 'percent', value: draft.surcharge?.value || 0 } : null;
      } else return;
      renderAdjust(); renderSum(); persist();
    };
    const onInput = e => {
      const t = e.target; if (!draft) return;
      if (t.id === 'discVal') {
        const v = Math.min(100, Math.max(0, Number(t.value) || 0));
        if (Number(t.value) > 100) t.value = '100';
        draft.discount = { ...(draft.discount || {}), label: 'Giảm giá', type: 'percent', value: v };
        renderSum(); persist();
      } else if (t.id === 'surVal') {
        const v = Math.min(100, Math.max(0, Number(t.value) || 0));
        if (Number(t.value) > 100) t.value = '100';
        draft.surcharge = { ...(draft.surcharge || {}), label: 'Phụ thu', type: 'percent', value: v };
        renderSum(); persist();
      } else if (t.id === 'received') { draft.received = fmtInput(t); updateDynamic(); }
      else if (t.id === 'cashPart') { draft.cashPart = fmtInput(t); updateDynamic(); }
    };
    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    el.addEventListener('input', onInput);
    return () => { el.removeEventListener('click', onClick); el.removeEventListener('change', onChange); el.removeEventListener('input', onInput); };
  },
  update(keys) {
    if (!keys.has('bills') && !keys.has('settings')) return;
    const b = bill();
    if (!b) { if (!done && store.loaded.has('bills')) notActive(); return; }
    if (!draft) { initDraft(b); skeleton(); renderAdjust(); renderMethod(); }
    renderItems(); renderSum();
    const pill = el.querySelector('.ph-title .pill');
    if (pill) { pill.className = 'pill st-' + b.status; pill.textContent = b.status === 'waiting' ? 'Chờ thanh toán' : 'Đang phục vụ'; }
    const title = el.querySelector('.ph-title b'); if (title) title.textContent = b.tableName;
    if (keys.has('settings')) { renderAdjust(); updateDynamic(); }
  },
};
