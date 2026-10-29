// ===== C05–C08 – Quản lý: thực đơn, bàn, nhân viên, cài đặt =====
import { db } from '../db.js';
import { store, billOfTable, DEFAULT_SETTINGS } from '../store.js';
import { icon, toast, modal, confirmBox, promptBox, setTitle } from '../ui.js';
import { esc, money, num, parseMoney, download, clone, norm } from '../utils.js';
import { BANKS, vietQR } from '../bill.js';
import { sendAuto } from '../zalo.js';

let el, tab = 'menu', menuPage = 0, menuQuery = '', settingsSubtab = 'shop';
const TABS = [['menu', 'Thực đơn', 'utensils'], ['tables', 'Bàn & khu vực', 'grid'], ['settings', 'Cài đặt', 'settings']];
const nextOrder = list => Math.max(0, ...list.map(x => x.order || 0)) + 1;
const categoryHue = index => `hsl(${(210 + index * 7) % 360} 42% 42%)`;

/* ================= THỰC ĐƠN ================= */
function menuPageData() {
  const matches = menuQuery ? store.menu.filter(m => norm(m.name).includes(norm(menuQuery))) : store.menu;
  const pages = store.categories.filter(c => matches.some(m => m.categoryId === c.id)).map(c => ({ id: c.id, name: c.name }));
  const orphan = matches.filter(m => !store.categories.some(c => c.id === m.categoryId));
  if (orphan.length) pages.push({ id: null, name: 'Chưa phân loại' });
  return { matches, pages, orphan };
}
function menuHTML() {
  const cats = store.categories;
  const { matches, pages, orphan } = menuPageData();
  menuPage = Math.max(0, Math.min(menuPage, pages.length - 1));
  const page = pages[menuPage];
  const shortcutStart = Math.max(0, Math.min(menuPage - 3, pages.length - 7));
  const visibleCategories = pages.slice(shortcutStart, shortcutStart + 7);
  const group = (c, items) => {
    const hue = categoryHue(Math.max(0, cats.findIndex(x => x.id === c?.id)));
    return `<div class="card mb admin-menu-card">
    <div class="card-h"><h3 class="category-heading" style="--category-color:${hue}">${esc(c ? c.name : 'Chưa phân loại')} <span class="muted xs">(${items.length})</span></h3>
      ${c ? `<div class="row"><button class="icon-btn sm" data-a="catUp" data-id="${c.id}" title="Lên">${icon('up')}</button><button class="icon-btn sm" data-a="catEdit" data-id="${c.id}" title="Đổi tên">${icon('edit')}</button><button class="icon-btn sm danger" data-a="catDel" data-id="${c.id}" title="Xóa">${icon('trash')}</button></div>` : ''}</div>
    <div class="list admin-menu-items" style="margin-top:8px">${items.map(m => `<div class="admin-row">
      <div class="ar-main"><b>${esc(m.name)}</b><span class="small muted">${m.price > 0 ? money(m.price) : esc(m.priceLabel || 'Chưa có giá')}${m.priceNote ? ` · ${esc(m.priceNote)}` : ''}</span></div>
      <label class="switch" title="Còn / hết món"><input type="checkbox" data-a="avail" data-id="${m.id}" ${m.available !== false ? 'checked' : ''}><span></span></label>
      <button class="icon-btn sm" data-a="itemEdit" data-id="${m.id}">${icon('edit')}</button>
      <button class="icon-btn sm danger" data-a="itemDel" data-id="${m.id}">${icon('trash')}</button>
    </div>`).join('') || '<div class="admin-row muted small">Chưa có món</div>'}</div></div>`;
  };
  return `<div class="menu-admin-toolbar mb"><div class="menu-admin-actions"><button class="btn btn-primary" data-a="itemAdd">${icon('plus')} Thêm món</button><button class="btn btn-primary" data-a="catAdd">${icon('layers')} Thêm danh mục</button></div>
    <div class="category-shortcuts">${visibleCategories.filter(c => c.id).map(c => { const i = cats.findIndex(x => x.id === c.id); return `<button class="category-shortcut ${page?.id === c.id ? 'active' : ''}" style="--category-color:${categoryHue(i)}" data-a="catPage" data-id="${c.id}">${esc(c.name)}</button>`; }).join('')}</div>
    </div>
    <div class="searchbox menu-admin-search">${icon('search')}<input class="input" id="menuSearch" type="search" placeholder="Tìm món trong toàn bộ thực đơn…" value="${esc(menuQuery)}" autocomplete="off"></div>
    ${page ? group(page.id ? cats.find(c => c.id === page.id) : null, page.id ? matches.filter(m => m.categoryId === page.id) : orphan) : menuQuery ? '<div class="empty">Không tìm thấy món phù hợp</div>' : '<div class="empty">Chưa có danh mục thực đơn</div>'}
    ${pages.length > 1 ? `<div class="menu-page-nav admin-menu-page mb">
      <button class="icon-btn" data-a="menuPrev" aria-label="Danh mục trước" ${menuPage <= 0 ? 'disabled' : ''}>${icon('back')}</button>
      <div class="menu-page-label"><small>${menuPage + 1} / ${pages.length}</small></div>
      <button class="icon-btn" data-a="menuNext" aria-label="Danh mục tiếp" ${menuPage >= pages.length - 1 ? 'disabled' : ''}>${icon('next')}</button>
    </div>` : ''}
    `;
}
async function itemForm(m = {}) {
  const res = await modal({
    title: m.id ? 'Sửa món' : 'Thêm món',
    body: `<div class="stack">
      <label class="field"><span>Tên món</span><input class="input" id="fn" value="${esc(m.name || '')}" placeholder="VD: Cơm tấm sườn"></label>
      <label class="field"><span>Giá bán cố định (VNĐ, để trống nếu giá thay đổi)</span><input class="input money" id="fp" inputmode="numeric" value="${m.price ? num(m.price) : ''}" placeholder="0"></label>
      <label class="field"><span>Thông tin giá (khoảng giá / Thời Giá / Thỏa Giá)</span><input class="input" id="fpl" value="${esc(m.priceLabel || '')}" placeholder="VD: 90.000 - 100.000"></label>
      <label class="field"><span>Danh mục</span><select class="input" id="fc">${store.categories.map(c => `<option value="${c.id}" ${c.id === m.categoryId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    </div>`,
    foot: `<button class="btn" data-close>Hủy</button><button class="btn btn-primary" data-ok>Lưu</button>`,
    onMount: api => {
      api.$('#fp').addEventListener('input', e => { const v = parseMoney(e.target.value); e.target.value = v ? num(v) : ''; });
      api.$('[data-ok]').onclick = () => {
        const name = api.$('#fn').value.trim(), price = parseMoney(api.$('#fp').value), priceLabel = api.$('#fpl').value.trim();
        if (!name) return api.$('#fn').focus();
        api.close({ name, price: price || null, priceLabel, categoryId: api.$('#fc').value });
      };
    },
  }).result;
  if (!res) return;
  if (m.id) await db.update('menu', m.id, res);
  else await db.add('menu', { ...res, available: true, order: nextOrder(store.menu) });
  toast('Đã lưu món');
}

/* ================= BÀN ================= */
function tablesHTML() {
  return `<div class="settings-grid">
    <div class="card"><div class="card-h"><h3>Khu vực</h3><button class="btn btn-sm btn-soft" data-a="areaAdd">${icon('plus')} Thêm</button></div>
      <div class="list" style="margin-top:8px">${store.areas.map(a => `<div class="admin-row"><div class="ar-main"><b>${esc(a.name)}</b><span class="xs muted">${store.tables.filter(t => t.areaId === a.id).length} bàn</span></div>
        <button class="icon-btn sm" data-a="areaEdit" data-id="${a.id}">${icon('edit')}</button><button class="icon-btn sm danger" data-a="areaDel" data-id="${a.id}">${icon('trash')}</button></div>`).join('') || '<div class="admin-row muted small">Chưa có khu vực</div>'}</div></div>
    <div class="card"><div class="card-h"><h3>Bàn (${store.tables.length})</h3>
        <div class="row"><button class="btn btn-sm btn-soft" data-a="tableAdd">${icon('plus')} 1 bàn</button><button class="btn btn-sm" data-a="tableBulk">+ Nhiều bàn</button></div></div>
      <div class="list" style="margin-top:8px">${store.tables.map(t => `<div class="admin-row">
        <div class="ar-main"><b>${esc(t.name)}</b><span class="xs muted">${esc(store.areas.find(a => a.id === t.areaId)?.name || 'Chưa có khu vực')}${billOfTable(t) ? ' · <span class="text-brand">đang có khách</span>' : ''}</span></div>
        <button class="icon-btn sm" data-a="tableEdit" data-id="${t.id}">${icon('edit')}</button><button class="icon-btn sm danger" data-a="tableDel" data-id="${t.id}">${icon('trash')}</button></div>`).join('')}</div></div>
  </div>`;
}
async function tableForm(t = {}) {
  const res = await modal({
    title: t.id ? 'Sửa bàn' : 'Thêm bàn',
    body: `<div class="stack"><label class="field"><span>Tên bàn</span><input class="input" id="tn" value="${esc(t.name || `Bàn ${store.tables.length + 1}`)}"></label>
      <label class="field"><span>Khu vực</span><select class="input" id="ta">${store.areas.map(a => `<option value="${a.id}" ${a.id === t.areaId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label></div>`,
    foot: `<button class="btn" data-close>Hủy</button><button class="btn btn-primary" data-ok>Lưu</button>`,
    onMount: api => api.$('[data-ok]').onclick = () => { const name = api.$('#tn').value.trim(); if (name) api.close({ name, areaId: api.$('#ta').value || null }); },
  }).result;
  if (!res) return;
  if (t.id) await db.update('tables', t.id, res);
  else await db.add('tables', { ...res, order: nextOrder(store.tables), status: 'empty', billId: null });
  toast('Đã lưu bàn');
}

/* ================= CÀI ĐẶT ================= */
let sdraft;
function settingsHTML() {
  const s = sdraft;
  s.address ||= '61k/Xã Hòa Phú,H.Long Hồ,Vĩnh Long';
  const z = s.zalo, b = s.bank;
  return `<div class="chips settings-subtabs">
      ${[['shop', 'Thông tin quán'], ['discounts', 'Giảm giá và phụ thu'], ['zalo', 'Gửi Zalo'], ['other', 'Khác']].map(([key, label]) => `<button type="button" class="chip ${settingsSubtab === key ? 'active' : ''}" data-settings-tab="${key}">${label}</button>`).join('')}
    </div>
    <div class="settings-grid settings-columns">
    <div class="card card-pad stack" data-settings-panel="shop" ${settingsSubtab === 'shop' ? '' : 'hidden'}><h3>${icon('store')} Thông tin quán</h3>
      <label class="field"><span>Tên quán</span><input class="input" data-k="shopName" value="${esc(s.shopName)}"></label>
      <label class="field"><span>Khẩu hiệu</span><input class="input" data-k="slogan" value="${esc(s.slogan || '')}"></label>
      <label class="field"><span>Địa chỉ</span><input class="input" data-k="address" value="${esc(s.address)}" placeholder="Số nhà, đường, quận…"></label>
      <label class="field"><span>Số điện thoại</span><input class="input" data-k="phone" value="${esc((s.phone || '').split(/\s+-\s+/)[0])}" inputmode="tel"></label>
      <label class="field"><span>Chủ quán</span><input class="input" data-k="ownerName" value="${esc(s.ownerName || (s.phone || '').split(/\s+-\s+/)[1] || '')}"></label>
    </div>

    <div class="card card-pad stack" data-settings-panel="shop" ${settingsSubtab === 'shop' ? '' : 'hidden'}><h3>${icon('qr')} Chuyển khoản (VietQR)</h3>
      <label class="field"><span>Ngân hàng</span><select class="input" data-k="bank.bin"><option value="">— Chọn ngân hàng —</option>${BANKS.map(([bin, n]) => `<option value="${bin}" ${bin === b.bin ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="field"><span>Số tài khoản</span><input class="input" data-k="bank.accountNo" value="${esc(b.accountNo)}" inputmode="numeric"></label>
      <label class="field"><span>Tên chủ tài khoản (KHÔNG DẤU)</span><input class="input" data-k="bank.accountName" value="${esc(b.accountName)}" placeholder="NGUYEN VAN A" style="text-transform:uppercase"></label>
      <button class="btn btn-soft" data-a="qrTest">${icon('qr')} Xem thử mã QR 10.000đ</button>
    </div>

    <div class="card card-pad stack" data-settings-panel="discounts" ${settingsSubtab === 'discounts' ? '' : 'hidden'}><h3>${icon('tag')} Giảm giá & Phụ thu</h3>
      <label class="field"><span>Mức giảm giá nhanh (%) – cách nhau dấu phẩy</span><input class="input" data-k="discountPresets" data-type="numlist" value="${s.discountPresets.join(', ')}"></label>
      <div class="label">Các loại phụ thu</div>
      <div class="stack-sm" id="surList">${s.surchargePresets.map((x, i) => `<div class="preset-line">
        <input class="input" data-sp="${i}" data-f="label" value="${esc(x.label)}" placeholder="Tên">
        <input class="input" data-sp="${i}" data-f="value" value="${x.value}" inputmode="numeric">
        <select class="input" data-sp="${i}" data-f="type"><option value="percent" ${x.type === 'percent' ? 'selected' : ''}>%</option><option value="amount" ${x.type === 'amount' ? 'selected' : ''}>VNĐ</option></select>
        <button class="icon-btn sm danger" data-a="spDel" data-i="${i}">${icon('trash')}</button></div>`).join('')}</div>
      <button class="btn btn-sm" data-a="spAdd">${icon('plus')} Thêm loại phụ thu</button>
    </div>

    <div class="card card-pad stack" data-settings-panel="zalo" ${settingsSubtab === 'zalo' ? '' : 'hidden'}><h3>${icon('zalo')} Gửi nhóm Zalo</h3>
      <div class="row-between"><span><b>Gửi phiếu bếp</b></span><label class="switch"><input type="checkbox" data-k="zalo.sendKitchen" ${z.sendKitchen ? 'checked' : ''}><span></span></label></div>
      <div class="row-between"><span><b>Gửi hóa đơn</b></span><label class="switch"><input type="checkbox" data-k="zalo.sendBill" ${z.sendBill ? 'checked' : ''}><span></span></label></div>
      <div class="divider"></div>
      <div class="row-between"><span><b>Gửi TỰ ĐỘNG qua Zalo Bot</b></span><label class="switch"><input type="checkbox" data-k="zalo.auto" ${z.auto ? 'checked' : ''}><span></span></label></div>
      <div class="stack ${z.auto ? '' : 'hidden'}" id="zaloAuto">
        <label class="field"><span>Địa chỉ Worker (Cloudflare)</span><input class="input" data-k="zalo.workerUrl" value="${esc(z.workerUrl)}" placeholder="https://quanla-zalo.ten-ban.workers.dev"></label>
        <label class="field"><span>App Key (APP_KEY trong Worker)</span><input class="input" data-k="zalo.appKey" value="${esc(z.appKey)}" type="password" autocomplete="off"></label>
        <label class="field"><span>ID nhóm Bếp</span><input class="input" data-k="zalo.kitchenChatId" value="${esc(z.kitchenChatId)}" placeholder="Nhắn /id trong nhóm để lấy"></label>
        <label class="field"><span>ID nhóm Hóa đơn (bỏ trống = dùng nhóm Bếp)</span><input class="input" data-k="zalo.billChatId" value="${esc(z.billChatId)}"></label>
        <button class="btn btn-soft" data-a="zaloTest">${icon('send')} Gửi tin thử</button>
      </div>
    </div>

    <div class="card card-pad stack" data-settings-panel="other" ${settingsSubtab === 'other' ? '' : 'hidden'}><h3>${icon('clock')} Khác</h3>
      <label class="field"><span>Ghi chú nhanh khi gọi món – cách nhau dấu phẩy</span><input class="input" data-k="noteChips" data-type="list" value="${esc(s.noteChips.join(', '))}"></label>
      <label class="field"><span>Lý do hủy món – cách nhau dấu phẩy</span><input class="input" data-k="voidReasons" data-type="list" value="${esc(s.voidReasons.join(', '))}"></label>
      <div class="row-between"><span><b>Yêu cầu mật khẩu/PIN</b></span><label class="switch"><input type="checkbox" data-k="requirePin" ${s.requirePin !== false ? 'checked' : ''} ${db.mode === 'firebase' ? 'disabled' : ''}><span></span></label></div>
      <label class="field"><span>Cảnh báo bàn ngồi lâu (phút)</span><input class="input" data-k="longSitMinutes" data-type="num" value="${s.longSitMinutes}" inputmode="numeric"></label>
      <label class="field"><span>Tự khóa máy Thu Ngân sau (phút, 0 = tắt)</span><input class="input" data-k="lockMinutes" data-type="num" value="${s.lockMinutes}" inputmode="numeric"></label>
      ${db.mode === 'local' ? `<div class="divider"></div><div class="label">Dữ liệu (chế độ demo)</div>
        <div class="btn-row wrap"><button class="btn btn-sm" data-a="export">${icon('download')} Sao lưu</button>
        <label class="btn btn-sm">${icon('upload')} Khôi phục<input type="file" accept=".json" data-a="import" hidden></label>
        <button class="btn btn-sm btn-danger-soft" data-a="reset">${icon('trash')} Xóa dữ liệu</button></div>` : ''}
    </div>
  </div>
  <div class="settings-savebar"><button class="btn btn-primary" data-a="saveSettings">${icon('check')} Lưu cài đặt</button></div>`;
}
function setPath(obj, path, val) { const ks = path.split('.'); let o = obj; while (ks.length > 1) o = o[ks.shift()]; o[ks[0]] = val; }

/* ================= RENDER ================= */
function render() {
  const body = tab === 'menu' ? menuHTML() : tab === 'tables' ? tablesHTML() : settingsHTML();
  el.innerHTML = `<div class="page-head"><h1>Quản lý</h1></div>
    <div class="chips admin-tabs">${TABS.map(([k, l, i]) => `<a class="chip ${tab === k ? 'active' : ''}" href="#/admin/${k}">${icon(i)} ${l}</a>`).join('')}</div>
    <div id="abody">${body}</div>`;
}

async function onAction(a, t) {
  const id = t.dataset.id;
  const find = (list) => list.find(x => x.id === id);
  switch (a) {
    /* thực đơn */
    case 'catPage': menuPage = menuPageData().pages.findIndex(c => c.id === id); if (menuPage >= 0) { render(); el.closest('.main')?.scrollTo(0, 0); } return;
    case 'menuPrev': menuPage = Math.max(0, menuPage - 1); render(); el.closest('.main')?.scrollTo(0, 0); return;
    case 'menuNext': menuPage = Math.min(menuPageData().pages.length - 1, menuPage + 1); render(); el.closest('.main')?.scrollTo(0, 0); return;
    case 'itemAdd': if (!store.categories.length) return toast('Thêm danh mục trước', 'warn'); return itemForm({ categoryId: store.categories[0].id });
    case 'itemEdit': return itemForm(find(store.menu));
    case 'itemDel': { const m = find(store.menu); if (await confirmBox(`Xóa món <b>${esc(m.name)}</b>?`, { danger: true, okText: 'Xóa' })) { await db.remove('menu', id); toast('Đã xóa'); } return; }
    case 'catAdd': { const n = await promptBox({ title: 'Thêm danh mục', placeholder: 'VD: Món nướng', required: true }); if (n) await db.add('categories', { name: n, order: nextOrder(store.categories) }); return; }
    case 'catEdit': { const c = find(store.categories); const n = await promptBox({ title: 'Đổi tên danh mục', value: c.name, required: true }); if (n) await db.update('categories', id, { name: n }); return; }
    case 'catDel': { const c = find(store.categories); const cnt = store.menu.filter(m => m.categoryId === id).length; if (cnt) return toast(`Danh mục còn ${cnt} món – chuyển/xóa món trước`, 'warn'); if (await confirmBox(`Xóa danh mục <b>${esc(c.name)}</b>?`, { danger: true })) await db.remove('categories', id); return; }
    case 'catUp': {
      const i = store.categories.findIndex(c => c.id === id); if (i <= 0) return;
      const a1 = store.categories[i - 1], b1 = store.categories[i];
      await db.batch([['update', 'categories', a1.id, { order: b1.order ?? i }], ['update', 'categories', b1.id, { order: a1.order ?? i - 1 }]]); return;
    }
    /* bàn */
    case 'areaAdd': { const n = await promptBox({ title: 'Thêm khu vực', placeholder: 'VD: Tầng 2', required: true }); if (n) await db.add('areas', { name: n, order: nextOrder(store.areas) }); return; }
    case 'areaEdit': { const x = find(store.areas); const n = await promptBox({ title: 'Đổi tên khu vực', value: x.name, required: true }); if (n) await db.update('areas', id, { name: n }); return; }
    case 'areaDel': { const x = find(store.areas); if (store.tables.some(t => t.areaId === id)) return toast('Khu vực còn bàn – chuyển bàn sang khu khác trước', 'warn'); if (await confirmBox(`Xóa khu vực <b>${esc(x.name)}</b>?`, { danger: true })) await db.remove('areas', id); return; }
    case 'tableAdd': return tableForm({ areaId: store.areas[0]?.id });
    case 'tableEdit': return tableForm(find(store.tables));
    case 'tableBulk': {
      const n = parseInt(await promptBox({ title: 'Thêm nhiều bàn', label: 'Số bàn cần thêm', type: 'number', value: '5', okText: 'Thêm' }), 10);
      if (!n || n < 1 || n > 100) return;
      const nums = store.tables.map(t => parseInt(String(t.name).replace(/\D/g, ''), 10) || 0);
      let start = Math.max(0, ...nums), order = nextOrder(store.tables);
      const ops = [];
      for (let i = 1; i <= n; i++) ops.push(['set', 'tables', db.newId(), { name: `Bàn ${start + i}`, areaId: store.areas[0]?.id || null, order: order++, status: 'empty', billId: null }]);
      await db.batch(ops); toast(`Đã thêm ${n} bàn`); return;
    }
    case 'tableDel': { const x = find(store.tables); if (billOfTable(x)) return toast('Bàn đang có khách, không xóa được', 'warn'); if (await confirmBox(`Xóa <b>${esc(x.name)}</b>?`, { danger: true, okText: 'Xóa' })) await db.remove('tables', id); return; }
    case 'pin': {
      const role = t.dataset.role;
      const p = await promptBox({ title: `Đổi mã PIN ${role === 'order' ? 'Order' : 'Thu Ngân'}`, label: 'Mã PIN mới (6 số)', type: 'number', required: true });
      if (!p) return;
      if (!/^\d{6}$/.test(p)) return toast('Mã PIN phải gồm đúng 6 chữ số', 'warn');
      try { await db.changePin(role, p); toast('Đã đổi mã PIN'); } catch (e) { toast(e.message, 'err', 5000); }
      return;
    }
    /* cài đặt */
    case 'spAdd': sdraft.surchargePresets.push({ label: 'Phụ thu', type: 'percent', value: 10 }); return render();
    case 'spDel': sdraft.surchargePresets.splice(+t.dataset.i, 1); return render();
    case 'qrTest': {
      const url = vietQR(10000, 'Test Quan La');
      if (!url) return toast('Chọn ngân hàng và nhập số tài khoản, rồi bấm Lưu', 'warn');
      return modal({ title: 'Mã QR thử', body: `<div class="qr-box"><img src="${url}" alt="QR"><div class="small">Quét bằng app ngân hàng để kiểm tra tên tài khoản (không cần chuyển)</div></div>` });
    }
    case 'zaloTest': {
      const z = sdraft.zalo;
      if (!z.workerUrl || !z.appKey || !z.kitchenChatId) return toast('Nhập đủ Worker, App Key và ID nhóm', 'warn');
      const old = store.settings.zalo; store.settings.zalo = z;
      try { await sendAuto(z.kitchenChatId, `${sdraft.shopName}: kết nối Zalo thành công!`); toast('Đã gửi tin thử – kiểm tra nhóm Zalo'); }
      catch (e) { toast('Gửi lỗi: ' + e.message, 'err', 5000); }
      store.settings.zalo = old; return;
    }
    case 'saveSettings': {
      const s = clone(sdraft);
      if (store.settings.pins) s.pins = store.settings.pins;
      s.bank.accountName = (s.bank.accountName || '').toUpperCase();
      await db.set('settings', 'main', s);
      toast('Đã lưu cài đặt'); return;
    }
    case 'export': download(`quan-la-sao-luu-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(db.exportAll(), null, 1), 'application/json'); return;
    case 'reset': if (await confirmBox('Xóa <b>toàn bộ dữ liệu demo</b> và khôi phục dữ liệu mẫu?', { danger: true, okText: 'Xóa hết' })) { db.resetAll(); localStorage.removeItem('ql_session'); location.reload(); } return;
  }
}

export default {
  async mount(root, [t]) {
    el = root; tab = TABS.some(x => x[0] === t) ? t : 'menu'; menuQuery = '';
    setTitle('Quản lý · ' + TABS.find(x => x[0] === tab)[1]);
    sdraft = clone({ ...DEFAULT_SETTINGS, ...store.settings }); delete sdraft.pins;
    render();
    const onClick = e => {
      const settingsButton = e.target.closest('[data-settings-tab]');
      if (settingsButton) { settingsSubtab = settingsButton.dataset.settingsTab; render(); return; }
      const b = e.target.closest('[data-a]');
      if (!b || b.tagName === 'INPUT') return;
      onAction(b.dataset.a, b);
    };
    const onChange = async e => {
      const t = e.target;
      if (t.dataset.a === 'avail') { await db.update('menu', t.dataset.id, { available: t.checked }); return; }
      if (t.dataset.a === 'import') {
        const f = t.files[0]; if (!f) return;
        try { db.importAll(JSON.parse(await f.text())); toast('Đã khôi phục dữ liệu'); setTimeout(() => location.reload(), 600); } catch { toast('File không hợp lệ', 'err'); }
        return;
      }
      if (t.dataset.k) {
        let v = t.type === 'checkbox' ? t.checked : t.value;
        if (t.dataset.type === 'num') v = parseInt(v, 10) || 0;
        if (t.dataset.type === 'numlist') v = v.split(',').map(x => parseFloat(x)).filter(x => x > 0);
        if (t.dataset.type === 'list') v = v.split(',').map(x => x.trim()).filter(Boolean);
        setPath(sdraft, t.dataset.k, v);
        if (t.dataset.k === 'zalo.auto') el.querySelector('#zaloAuto')?.classList.toggle('hidden', !v);
      }
      if (t.dataset.sp !== undefined) {
        const p = sdraft.surchargePresets[+t.dataset.sp];
        p[t.dataset.f] = t.dataset.f === 'value' ? (parseFloat(t.value) || 0) : t.value;
      }
    };
    const onInput = e => {
      if (e.target.id !== 'menuSearch') return;
      menuQuery = e.target.value;
      menuPage = 0;
      render();
      const input = el.querySelector('#menuSearch');
      input?.focus(); input?.setSelectionRange(menuQuery.length, menuQuery.length);
    };
    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    el.addEventListener('input', onInput);
    return () => { el.removeEventListener('click', onClick); el.removeEventListener('change', onChange); el.removeEventListener('input', onInput); };
  },
  update(keys) {
    if (tab === 'settings') return; // không ghi đè khi đang sửa
    if (['menu', 'categories', 'tables', 'areas', 'staff', 'bills'].some(k => keys.has(k))) {
      const y = el.closest('.main')?.scrollTop || window.scrollY;
      render();
      const m = el.closest('.main'); if (m) m.scrollTop = y; window.scrollTo(0, y);
    }
  },
};
