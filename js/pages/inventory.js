// ===== Quản lý Tồn kho (Bia - Nước ngọt) – Thu ngân =====
import { store } from '../store.js';
import { db } from '../db.js';
import { icon, setTitle, toast, modal, confirmBox } from '../ui.js';
import { esc, num, money, norm, dayKey, download, fmtDT } from '../utils.js';
import { isTrackedItem, defaultUnit, formatStockQty, importStock, adjustStock } from '../actions.js';

let el;
let filter = 'all_drinks'; // 'all_drinks' | 'beer' | 'soft_drink' | 'low_stock' | 'all'
let q = '';

function getCategoryName(catId) {
  return store.categories.find(c => c.id === catId)?.name || 'Khác';
}

function isBeer(name) {
  return /bia|tiger|heineken|sài gòn|saigon|larue|bạc|nâu|chill|gold|333|corona|budweiser/i.test(name);
}

function isSoftDrink(name) {
  return /nước ngọt|nước suối|coca|pepsi|sting|redbull|bò húc|revive|aquafina|suối|khoáng|cam ép|trà/i.test(name);
}

function getItemType(m) {
  if (isBeer(m.name)) return 'Bia';
  if (isSoftDrink(m.name)) return 'Nước ngọt & Suối';
  return 'Đồ uống khác';
}

function getTrackedList() {
  const nq = norm(q);
  // Danh sách các mặt hàng theo dõi
  let list = store.menu.filter(m => {
    if (filter === 'all') return true;
    const tracked = isTrackedItem(m);
    if (!tracked) return false;
    if (filter === 'beer') return isBeer(m.name);
    if (filter === 'soft_drink') return isSoftDrink(m.name);
    if (filter === 'low_stock') {
      const stock = Number(m.stock || 0);
      return stock <= 10;
    }
    return true; // 'all_drinks'
  });

  if (nq) {
    list = list.filter(m => norm(m.name).includes(nq) || norm(getCategoryName(m.categoryId)).includes(nq));
  }

  // Sắp xếp: Bia -> Nước ngọt -> Tên
  return list.sort((a, b) => {
    const typeA = getItemType(a), typeB = getItemType(b);
    if (typeA !== typeB) return typeA.localeCompare(typeB, 'vi');
    return a.name.localeCompare(b.name, 'vi');
  });
}

function computeMetrics() {
  const allDrinks = store.menu.filter(isTrackedItem);
  let totalUnits = 0;
  let lowCount = 0;
  let outCount = 0;

  for (const m of allDrinks) {
    const s = Number(m.stock || 0);
    totalUnits += Math.max(0, s);
    if (s <= 0) outCount++;
    else if (s <= 10) lowCount++;
  }

  const packs = Math.floor(totalUnits / 24);
  const remainder = totalUnits % 24;
  const packText = packs > 0 ? `${packs} thùng ${remainder ? `+ ${remainder} lon` : 'chẵn'}` : `${totalUnits} lon/chai`;

  return {
    itemCount: allDrinks.length,
    totalUnits,
    packText,
    lowCount,
    outCount,
  };
}

function render() {
  if (!el) return;
  const metrics = computeMetrics();
  const list = getTrackedList();

  el.querySelector('#invMetrics').innerHTML = `
    <div class="inv-metric">
      <div class="im-icon">${icon('box')}</div>
      <div class="im-data">
        <span class="im-label">Tổng mặt hàng</span>
        <b class="im-val">${metrics.itemCount} <small>loại</small></b>
      </div>
    </div>
    <div class="inv-metric metric-primary">
      <div class="im-icon">${icon('layers')}</div>
      <div class="im-data">
        <span class="im-label">Tổng tồn kho quy đổi</span>
        <b class="im-val">${num(metrics.totalUnits)} <small>lon/chai</small></b>
        <span class="im-sub">≈ ${metrics.packText}</span>
      </div>
    </div>
    <div class="inv-metric ${metrics.lowCount ? 'metric-warn' : ''}">
      <div class="im-icon">${icon('alert')}</div>
      <div class="im-data">
        <span class="im-label">Cảnh báo sắp hết (≤ 10)</span>
        <b class="im-val">${metrics.lowCount} <small>loại</small></b>
        <span class="im-sub">${metrics.lowCount ? 'Cần nhập bổ sung sớm' : 'Kho ổn định'}</span>
      </div>
    </div>
    <div class="inv-metric ${metrics.outCount ? 'metric-danger' : ''}">
      <div class="im-icon">${icon('ban')}</div>
      <div class="im-data">
        <span class="im-label">Hết hàng / Âm kho</span>
        <b class="im-val">${metrics.outCount} <small>loại</small></b>
        <span class="im-sub">${metrics.outCount ? 'Cần kiểm tra hoặc nhập' : 'Không có'}</span>
      </div>
    </div>
  `;

  // Render bảng Excel
  const tbody = el.querySelector('#invTableBody');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="excel-empty">Không tìm thấy mặt hàng nào phù hợp với bộ lọc</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((m, idx) => {
    const stock = Number(m.stock || 0);
    const unit = m.unit || defaultUnit(m.name);
    const packSize = Number(m.packSize) || 24;
    const formatted = formatStockQty(stock, packSize, unit);
    const exported = Number(m.totalExported || 0);
    const imported = Number(m.totalImported || 0);
    const type = getItemType(m);

    let statusBadge = '<span class="excel-badge badge-ok">Còn hàng</span>';
    let rowClass = '';
    if (stock <= 0) {
      statusBadge = stock < 0 ? '<span class="excel-badge badge-danger">Âm kho</span>' : '<span class="excel-badge badge-danger">Hết hàng</span>';
      rowClass = 'row-danger';
    } else if (stock <= 10) {
      statusBadge = '<span class="excel-badge badge-warn">Sắp hết</span>';
      rowClass = 'row-warn';
    }

    return `<tr class="${rowClass}">
      <td class="col-stt">${idx + 1}</td>
      <td class="col-name">
        <b>${esc(m.name)}</b>
        <div class="excel-sub">${m.price ? money(m.price) : esc(m.priceLabel || 'Chưa định giá')}</div>
      </td>
      <td class="col-type"><span class="type-tag ${type === 'Bia' ? 'tag-beer' : 'tag-drink'}">${type}</span></td>
      <td class="col-unit">${esc(unit)}</td>
      <td class="col-pack">${packSize} ${unit.toLowerCase()}/thùng</td>
      <td class="col-stock">
        <div class="stock-main ${formatted.isOut ? 'text-danger' : formatted.isLow ? 'text-warn' : 'text-ok'}">
          <b>${formatted.main}</b>
        </div>
        <div class="stock-sub">${formatted.packText}</div>
      </td>
      <td class="col-exported">${exported ? `<b>${num(exported)}</b> ${unit.toLowerCase()}` : '<span class="muted">-</span>'}</td>
      <td class="col-imported">${imported ? `<b>${num(imported)}</b> ${unit.toLowerCase()}` : '<span class="muted">-</span>'}</td>
      <td class="col-status">${statusBadge}</td>
      <td class="col-actions">
        <button class="btn btn-sm btn-primary-soft" data-act="importOne" data-id="${m.id}" title="Nhập thêm hàng">${icon('plus')} Nhập</button>
        <button class="btn btn-sm btn-ghost" data-act="adjustOne" data-id="${m.id}" title="Kiểm kê / Sửa tồn">${icon('edit')} Kiểm kê</button>
      </td>
    </tr>`;
  }).join('');
}

/** Modal Nhập kho */
async function showImportModal(targetId = null) {
  const tracked = store.menu.filter(isTrackedItem);
  if (!tracked.length) return toast('Chưa có mặt hàng nào được cấu hình theo dõi', 'warn');

  const defaultItem = targetId ? store.menu.find(m => m.id === targetId) : tracked[0];

  await modal({
    title: 'Phiếu Nhập Hàng Vào Kho',
    wide: false,
    body: `<div class="stack">
      <label class="field">
        <span>Chọn mặt hàng bia / nước ngọt</span>
        <select class="input" id="impItem">
          ${tracked.map(m => `<option value="${m.id}" ${m.id === defaultItem?.id ? 'selected' : ''}>${esc(m.name)} (Hiện tồn: ${m.stock || 0} ${m.unit || defaultUnit(m.name)})</option>`).join('')}
        </select>
      </label>

      <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label class="field">
          <span>Số thùng / két (x24)</span>
          <input class="input" type="number" id="impPacks" min="0" placeholder="0" value="0">
        </label>
        <label class="field">
          <span>Số lon / chai lẻ</span>
          <input class="input" type="number" id="impUnits" min="0" placeholder="0" value="0">
        </label>
      </div>

      <div class="calc-preview-box" id="impPreview" style="background:var(--brand-50);border:1px dashed var(--brand);border-radius:10px;padding:10px 14px">
        <span class="small muted">Tổng số lượng cộng vào kho:</span>
        <div style="font-size:18px;font-weight:750;color:var(--brand);margin-top:2px" id="impTotalText">0 lon/chai</div>
      </div>

      <label class="field">
        <span>Giá vốn nhập / lon (tùy chọn)</span>
        <input class="input money" type="number" id="impCost" placeholder="Để trống nếu không quản lý vốn">
      </label>

      <label class="field">
        <span>Ghi chú / Đại lý giao hàng</span>
        <input class="input" id="impNote" placeholder="VD: Đại lý bia nước ngọt Thành Phát giao">
      </label>
    </div>`,
    foot: `<button class="btn" data-close>Đóng</button><button class="btn btn-primary" data-save>${icon('check')} Xác nhận nhập kho</button>`,
    onMount: api => {
      const getSelected = () => store.menu.find(m => m.id === api.$('#impItem').value) || defaultItem;

      const updateCalc = () => {
        const item = getSelected();
        const unit = item?.unit || defaultUnit(item?.name);
        const packSize = Number(item?.packSize) || 24;
        const packs = Number(api.$('#impPacks').value) || 0;
        const loose = Number(api.$('#impUnits').value) || 0;
        const total = packs * packSize + loose;

        api.$('#impTotalText').textContent = total > 0
          ? `${num(total)} ${unit} (${packs} thùng + ${loose} ${unit.toLowerCase()})`
          : `0 ${unit}`;
      };

      api.$('#impItem').onchange = updateCalc;
      api.$('#impPacks').oninput = updateCalc;
      api.$('#impUnits').oninput = updateCalc;
      updateCalc();

      api.$('[data-save]').onclick = async () => {
        const item = getSelected();
        const packSize = Number(item?.packSize) || 24;
        const packs = Number(api.$('#impPacks').value) || 0;
        const loose = Number(api.$('#impUnits').value) || 0;
        const total = packs * packSize + loose;

        if (total <= 0) {
          toast('Vui lòng nhập số lượng thùng hoặc lon hợp lệ (> 0)', 'warn');
          return api.$('#impPacks').focus();
        }

        const note = api.$('#impNote').value.trim();
        const costPrice = Number(api.$('#impCost').value) || null;

        try {
          await importStock(item.id, total, note, costPrice, store.user?.name);
          toast(`Đã nhập +${total} ${item.unit || defaultUnit(item.name)} ${item.name} vào kho`, 'ok');
          api.close();
          render();
        } catch (e) {
          toast(e.message || 'Lỗi khi nhập kho', 'err');
        }
      };
    },
  });
}

/** Modal Kiểm kê / Điều chỉnh tồn */
async function showAdjustModal(itemId) {
  const m = store.menu.find(x => x.id === itemId);
  if (!m) return;
  const current = Number(m.stock || 0);
  const unit = m.unit || defaultUnit(m.name);
  const packSize = Number(m.packSize) || 24;

  await modal({
    title: `Kiểm kê – ${esc(m.name)}`,
    body: `<div class="stack">
      <div style="background:var(--surface-2);border-radius:10px;padding:12px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <span class="xs muted">Tồn sổ sách hiện tại</span>
          <div style="font-size:18px;font-weight:700">${current} ${unit}</div>
        </div>
        <div style="text-align:right">
          <span class="xs muted">Quy đổi</span>
          <div style="font-weight:600">${formatStockQty(current, packSize, unit).packText}</div>
        </div>
      </div>

      <label class="field">
        <span>Số lượng thực tế đếm được (${unit})</span>
        <input class="input" type="number" id="adjActual" value="${current}" autofocus>
      </label>

      <div id="adjDiffBox" style="padding:10px 14px;border-radius:10px;font-size:14px;font-weight:600"></div>

      <label class="field">
        <span>Lý do điều chỉnh / Ghi chú kiểm kho</span>
        <input class="input" id="adjNote" placeholder="VD: Kiểm kê cuối ngày, Khách uống lẻ, Bể vỡ...">
      </label>
    </div>`,
    foot: `<button class="btn" data-close>Hủy</button><button class="btn btn-primary" data-save>${icon('check')} Lưu kết quả kiểm kê</button>`,
    onMount: api => {
      const actualInput = api.$('#adjActual');
      const diffBox = api.$('#adjDiffBox');

      const updateDiff = () => {
        const val = Number(actualInput.value);
        const diff = val - current;
        if (diff === 0) {
          diffBox.style.background = 'var(--surface-2)';
          diffBox.style.color = 'var(--text)';
          diffBox.innerHTML = `${icon('check')} Số lượng khớp với sổ sách (không lệch)`;
        } else if (diff > 0) {
          diffBox.style.background = 'var(--brand-50)';
          diffBox.style.color = 'var(--brand)';
          diffBox.innerHTML = `Lệch: <b>+${diff} ${unit}</b> (Thừa so với sổ sách)`;
        } else {
          diffBox.style.background = 'var(--danger-50)';
          diffBox.style.color = 'var(--danger)';
          diffBox.innerHTML = `Lệch: <b>${diff} ${unit}</b> (Thiếu hụt so với sổ sách)`;
        }
      };

      actualInput.oninput = updateDiff;
      updateDiff();

      api.$('[data-save]').onclick = async () => {
        const val = Number(actualInput.value);
        if (isNaN(val)) return toast('Vui lòng nhập số hợp lệ', 'warn');
        const note = api.$('#adjNote').value.trim();
        try {
          await adjustStock(m.id, val, note, store.user?.name);
          toast(`Đã cập nhật tồn ${m.name} thành ${val} ${unit}`, 'ok');
          api.close();
          render();
        } catch (e) {
          toast(e.message || 'Lỗi khi kiểm kho', 'err');
        }
      };
    },
  });
}

/** Xem lịch sử nhập xuất kho */
async function showLogsModal() {
  const doc = await db.get('settings', 'inventory_logs');
  const logs = doc?.logs || [];

  await modal({
    title: 'Nhật Ký Nhập / Xuất Kho Gần Đây',
    wide: true,
    body: `<div class="stack">
      <p class="small muted">Lưu tối đa 300 giao dịch xuất bán từ hóa đơn, nhập kho từ đại lý và điều chỉnh kiểm kê.</p>
      <div style="max-height:420px;overflow:auto;border:1px solid var(--line);border-radius:10px">
        <table class="excel-table logs-table" style="width:100%;font-size:13px">
          <thead>
            <tr>
              <th style="width:120px">Thời gian</th>
              <th style="width:90px">Loại</th>
              <th>Mặt hàng</th>
              <th style="text-align:right;width:100px">Số lượng</th>
              <th>Người thực hiện</th>
              <th>Ghi chú / Mã đơn</th>
            </tr>
          </thead>
          <tbody>
            ${!logs.length ? '<tr><td colspan="6" class="excel-empty">Chưa có giao dịch nhập xuất nào</td></tr>' : logs.map(l => {
              const isSale = l.type === 'sale';
              const isImp = l.type === 'import';
              const badge = isSale
                ? '<span class="excel-badge badge-sale">Xuất bán</span>'
                : isImp
                  ? '<span class="excel-badge badge-import">Nhập kho</span>'
                  : '<span class="excel-badge badge-adjust">Kiểm kê</span>';

              const qtyColor = isSale ? 'text-danger' : isImp ? 'text-ok' : '';
              const qtyPrefix = isSale ? '-' : isImp ? '+' : (l.diff > 0 ? '+' : '');
              const qtyDisplay = isSale || isImp ? `${qtyPrefix}${num(l.qty)} ${l.unit || 'lon'}` : `${l.newStock} ${l.unit || 'lon'} (${l.diff > 0 ? '+' : ''}${l.diff})`;

              return `<tr>
                <td class="muted">${fmtDT(l.at)}</td>
                <td>${badge}</td>
                <td><b>${esc(l.name)}</b></td>
                <td style="text-align:right" class="${qtyColor}"><b>${qtyDisplay}</b></td>
                <td>${esc(l.by || 'Hệ thống')}</td>
                <td class="muted">${esc(l.billCode ? `HĐ: ${l.billCode}` : l.note || '-')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`,
    foot: `<button class="btn" data-close>Đóng</button>`,
  });
}

/** Xuất file Excel (.csv với UTF-8 BOM chuẩn cho Microsoft Excel) */
function exportExcel() {
  const list = getTrackedList();
  if (!list.length) return toast('Không có dữ liệu để xuất Excel', 'warn');

  const headers = ['STT', 'Tên mặt hàng', 'Phân loại', 'Đơn vị tính', 'Quy cách', 'Tồn kho hiện tại', 'Quy đổi thùng', 'Đã xuất bán', 'Tổng nhập', 'Trạng thái'];
  const rows = list.map((m, idx) => {
    const stock = Number(m.stock || 0);
    const unit = m.unit || defaultUnit(m.name);
    const packSize = Number(m.packSize) || 24;
    const formatted = formatStockQty(stock, packSize, unit);
    const exported = Number(m.totalExported || 0);
    const imported = Number(m.totalImported || 0);
    const type = getItemType(m);
    const status = stock <= 0 ? (stock < 0 ? 'Âm kho' : 'Hết hàng') : (stock <= 10 ? 'Sắp hết' : 'Còn hàng');

    return [
      idx + 1,
      `"${(m.name || '').replace(/"/g, '""')}"`,
      `"${type}"`,
      unit,
      `${packSize} ${unit}/thùng`,
      stock,
      `"${formatted.packText}"`,
      exported,
      imported,
      status,
    ].join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  download(`TonKho_QuanLa_${dayKey()}.csv`, csvContent, 'text/csv;charset=utf-8;');
  toast('Đã xuất file Excel thành công', 'ok');
}

/** Thêm nhanh mặt hàng đồ uống mới */
async function showAddTrackedItemModal() {
  const cats = store.categories;
  const drinkCat = cats.find(c => c.id === 'c8') || cats[0];

  await modal({
    title: 'Thêm Mặt Hàng Bia / Nước Ngọt Mới',
    body: `<div class="stack">
      <label class="field">
        <span>Tên mặt hàng</span>
        <input class="input" id="newItemName" placeholder="VD: Bia 333 Lon, Nước tăng lực RedBull..." autofocus>
      </label>
      <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label class="field">
          <span>Giá bán (VNĐ)</span>
          <input class="input money" id="newPrice" type="number" placeholder="VD: 15000">
        </label>
        <label class="field">
          <span>Đơn vị tính</span>
          <select class="input" id="newUnit">
            <option value="Lon">Lon</option>
            <option value="Chai">Chai</option>
            <option value="Thùng">Thùng</option>
          </select>
        </label>
      </div>
      <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label class="field">
          <span>Số lon/chai mỗi thùng</span>
          <input class="input" type="number" id="newPack" value="24">
        </label>
        <label class="field">
          <span>Số lượng tồn ban đầu</span>
          <input class="input" type="number" id="newInitStock" value="0">
        </label>
      </div>
      <label class="field">
        <span>Danh mục</span>
        <select class="input" id="newCat">
          ${cats.map(c => `<option value="${c.id}" ${c.id === drinkCat?.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
      </label>
    </div>`,
    foot: `<button class="btn" data-close>Hủy</button><button class="btn btn-primary" data-save>${icon('check')} Lưu mặt hàng</button>`,
    onMount: api => {
      api.$('[data-save]').onclick = async () => {
        const name = api.$('#newItemName').value.trim();
        if (!name) return api.$('#newItemName').focus();
        const price = Number(api.$('#newPrice').value) || null;
        const unit = api.$('#newUnit').value;
        const packSize = Number(api.$('#newPack').value) || 24;
        const initStock = Number(api.$('#newInitStock').value) || 0;
        const categoryId = api.$('#newCat').value;

        try {
          const id = await db.add('menu', {
            name,
            price,
            categoryId,
            unit,
            packSize,
            stock: initStock,
            totalImported: initStock,
            totalExported: 0,
            trackStock: true,
            available: true,
            order: (store.menu.length || 0) + 1,
          });
          toast(`Đã thêm món "${name}" vào danh mục và theo dõi tồn kho`, 'ok');
          api.close();
          render();
        } catch (e) {
          toast(e.message || 'Lỗi khi lưu', 'err');
        }
      };
    },
  });
}

export default {
  async mount(root) {
    el = root;
    setTitle('Tồn kho');
    filter = 'all_drinks';
    q = '';

    el.innerHTML = `
      <div class="inv-page">
        <!-- Excel Title & Toolbar -->
        <div class="inv-header">
          <div class="inv-header-title">
            <div class="excel-brand-badge">${icon('box')} TỒN KHO</div>
            <div>
              <h2>Quản Lý Tồn Kho Bia & Nước Ngọt</h2>
              <p class="xs muted">Tự động trừ kho khi xuất bán · Tự động cộng khi nhập hàng · Cảnh báo sắp hết</p>
            </div>
          </div>
          <div class="inv-header-actions">
            <button class="btn btn-primary" data-act="import">${icon('plus')} Nhập hàng</button>
            <button class="btn btn-soft" data-act="addItem">${icon('plus')} Thêm bia/nước</button>
            <button class="btn btn-ghost" data-act="export">${icon('download')} Xuất Excel</button>
            <button class="btn btn-ghost" data-act="logs">${icon('receipt')} Nhật ký kho</button>
          </div>
        </div>

        <!-- Metrics Ribbon -->
        <div class="inv-metrics" id="invMetrics"></div>

        <!-- Excel Control Toolbar (Search & Sheet Tabs) -->
        <div class="excel-toolbar">
          <div class="excel-tabs">
            <button class="excel-tab ${filter === 'all_drinks' ? 'active' : ''}" data-f="all_drinks">Tất cả đồ uống</button>
            <button class="excel-tab ${filter === 'beer' ? 'active' : ''}" data-f="beer">Bia</button>
            <button class="excel-tab ${filter === 'soft_drink' ? 'active' : ''}" data-f="soft_drink">Nước ngọt & Suối</button>
            <button class="excel-tab ${filter === 'low_stock' ? 'active' : ''}" data-f="low_stock">⚠️ Cảnh báo hết (≤10)</button>
            <button class="excel-tab ${filter === 'all' ? 'active' : ''}" data-f="all">Toàn bộ thực đơn</button>
          </div>
          <div class="excel-search">
            ${icon('search')}
            <input class="input" id="invSearch" placeholder="Tìm kiếm nhanh tên bia, nước ngọt…" value="${esc(q)}">
            ${q ? '<button class="clear-btn" id="invClear">&times;</button>' : ''}
          </div>
        </div>

        <!-- Excel Spreadsheet Table -->
        <div class="excel-wrap">
          <div class="excel-sheet-header">
            <div class="sheet-info">
              <span class="sheet-icon">📊</span>
              <b>Bảng_Theo_Dõi_Tồn_Kho.xlsx</b>
              <span class="xs muted">· Chế độ xem bảng tính trực quan</span>
            </div>
          </div>
          <div class="excel-scroll">
            <table class="excel-table">
              <thead>
                <tr class="excel-col-letters">
                  <th class="col-stt">A</th>
                  <th class="col-name">B</th>
                  <th class="col-type">C</th>
                  <th class="col-unit">D</th>
                  <th class="col-pack">E</th>
                  <th class="col-stock">F</th>
                  <th class="col-exported">G</th>
                  <th class="col-imported">H</th>
                  <th class="col-status">I</th>
                  <th class="col-actions">J</th>
                </tr>
                <tr class="excel-col-headers">
                  <th class="col-stt">STT</th>
                  <th class="col-name">Tên mặt hàng</th>
                  <th class="col-type">Phân loại</th>
                  <th class="col-unit">ĐVT</th>
                  <th class="col-pack">Quy cách</th>
                  <th class="col-stock">Tồn kho hiện tại</th>
                  <th class="col-exported">Đã bán (Xuất)</th>
                  <th class="col-imported">Tổng nhập</th>
                  <th class="col-status">Trạng thái</th>
                  <th class="col-actions">Thao tác</th>
                </tr>
              </thead>
              <tbody id="invTableBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    render();

    // Event listeners
    const onClick = async e => {
      const btn = e.target.closest('[data-act],[data-f]');
      if (!btn) return;
      const act = btn.dataset.act;
      const f = btn.dataset.f;

      if (f) {
        filter = f;
        el.querySelectorAll('.excel-tab').forEach(t => t.classList.toggle('active', t.dataset.f === f));
        render();
        return;
      }

      if (act === 'import') showImportModal();
      else if (act === 'addItem') showAddTrackedItemModal();
      else if (act === 'export') exportExcel();
      else if (act === 'logs') showLogsModal();
      else if (act === 'importOne') showImportModal(btn.dataset.id);
      else if (act === 'adjustOne') showAdjustModal(btn.dataset.id);
    };

    const onInput = e => {
      if (e.target.id === 'invSearch') {
        q = e.target.value;
        render();
      }
    };

    const onClear = e => {
      if (e.target.id === 'invClear') {
        q = '';
        const input = el.querySelector('#invSearch');
        if (input) { input.value = ''; input.focus(); }
        render();
      }
    };

    el.addEventListener('click', onClick);
    el.addEventListener('click', onClear);
    el.addEventListener('input', onInput);

    return () => {
      el.removeEventListener('click', onClick);
      el.removeEventListener('click', onClear);
      el.removeEventListener('input', onInput);
    };
  },

  update(keys) {
    if (keys.has('menu') || keys.has('categories')) {
      render();
    }
  },
};
