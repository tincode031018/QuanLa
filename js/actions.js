// ===== Nghiệp vụ: mở bàn, gửi món, tính tiền, chuyển/gộp bàn, hủy món, thanh toán =====
import { db, F } from './db.js';
import { store, tableById } from './store.js';
import { uid, dayKey } from './utils.js';
import { calc } from './bill.js';

const ACTIVE = ['open', 'waiting'];
const isNetErr = e => /unavailable|network|offline|failed-precondition|deadline/i.test(`${e?.code} ${e?.message}`);

// Giao dịch an toàn: online -> transaction (chống 2 người ghi đè), offline -> ghi thẳng
async function safeTxn(run, fallback) {
  if (db.mode === 'firebase' && !navigator.onLine) return fallback();
  try {
    return await Promise.race([db.txn(run), new Promise((_, rej) => setTimeout(() => rej({ code: 'deadline' }), 8000))]);
  } catch (e) {
    if (isNetErr(e)) return fallback();
    throw e;
  }
}

/** Mở bàn (nếu chưa có bill) – trả về billId */
export async function ensureBill(tableId, by) {
  const t = tableById(tableId);
  if (t?.billId && store.bills[t.billId]) return t.billId;
  const id = db.newId();
  const now = Date.now();
  const make = table => ({ tableId, tableName: table.name, status: 'open', openedAt: now, openedBy: by, items: [], rounds: 0, staff: [by], updatedAt: now });
  return safeTxn(async tx => {
    const table = await tx.get('tables', tableId);
    if (!table) throw new Error('Không tìm thấy bàn');
    if (table.billId) {
      const b = await tx.get('bills', table.billId);
      if (b && ACTIVE.includes(b.status)) return table.billId;
    }
    tx.set('bills', id, make(table));
    tx.update('tables', tableId, { status: 'serving', billId: id, openedAt: now });
    return id;
  }, async () => {
    await db.batch([['set', 'bills', id, make(t)], ['update', 'tables', tableId, { status: 'serving', billId: id, openedAt: now }]]);
    return id;
  });
}

/** Gửi món (1 "lần gọi") vào bill */
export async function sendItems(tableId, cart, by) {
  const billId = await ensureBill(tableId, by);
  const bill = store.bills[billId] || await db.get('bills', billId);
  const round = (bill?.rounds || 0) + 1;
  const at = Date.now();
  const items = cart.map(c => ({ id: uid(), menuId: c.menuId, name: c.name, price: c.price, qty: c.qty, note: c.note || '', round, by, at }));
  const patch = { items: F.arrayUnion(...items), rounds: F.increment(1), staff: F.arrayUnion(by), updatedAt: at, lastBy: by };
  const ops = [];
  if (bill?.status === 'waiting') { patch.status = 'open'; ops.push(['update', 'tables', tableId, { status: 'serving' }]); }
  ops.unshift(['update', 'bills', billId, patch]);
  await db.batch(ops);
  return { billId, items, round, at, tableName: bill?.tableName || tableById(tableId)?.name };
}

/** Order bấm "Tính tiền" */
export async function requestPayment(billId, by) {
  const b = store.bills[billId];
  if (!b) throw new Error('Bàn chưa có món');
  await db.batch([
    ['update', 'bills', billId, { status: 'waiting', requestedAt: Date.now(), requestedBy: by, updatedAt: Date.now(), lastBy: by }],
    ['update', 'tables', b.tableId, { status: 'waiting' }],
  ]);
}
export async function reopenBill(billId) {
  const b = store.bills[billId];
  await db.batch([['update', 'bills', billId, { status: 'open', updatedAt: Date.now() }], ['update', 'tables', b.tableId, { status: 'serving' }]]);
}

/** Chuyển bàn */
export async function moveTable(fromId, toId) {
  const from = tableById(fromId), to = tableById(toId);
  if (!from?.billId) throw new Error('Bàn nguồn chưa có khách');
  if (to.billId && store.bills[to.billId]) throw new Error('Bàn đích đang có khách');
  const billId = from.billId;
  const ops = tx => {
    tx.update('bills', billId, { tableId: toId, tableName: to.name, updatedAt: Date.now() });
    tx.update('tables', toId, { status: from.status, billId, openedAt: from.openedAt || Date.now() });
    tx.update('tables', fromId, { status: 'empty', billId: null, openedAt: null });
  };
  await safeTxn(async tx => {
    const t2 = await tx.get('tables', toId);
    if (t2.billId) { const b2 = await tx.get('bills', t2.billId); if (b2 && ACTIVE.includes(b2.status)) throw new Error('Bàn đích vừa có khách'); }
    ops(tx);
  }, async () => { const w = []; ops({ update: (c, i, p) => w.push(['update', c, i, p]) }); await db.batch(w); });
  // chuyển giỏ chưa gửi trên máy này
  const k = id => 'ql_cart_' + id;
  const cart = localStorage.getItem(k(fromId));
  if (cart) { localStorage.setItem(k(toId), cart); localStorage.removeItem(k(fromId)); }
}

/** Gộp bill nguồn vào bill đích (thu ngân) */
export async function mergeBills(srcId, dstId, by) {
  const src = store.bills[srcId], dst = store.bills[dstId];
  if (!src || !dst) throw new Error('Bill không còn hoạt động');
  const now = Date.now();
  const moved = (src.items || []).map(i => ({ ...i, id: uid(), note: [i.note, `từ ${src.tableName}`].filter(Boolean).join(' · ') }));
  const ops = [
    ['update', 'bills', dstId, { items: F.arrayUnion(...moved), staff: F.arrayUnion(...(src.staff || [])), rounds: F.increment(1), updatedAt: now }],
    ['update', 'bills', srcId, { status: 'merged', mergedInto: dstId, closedAt: now, closedBy: by, day: dayKey(now), updatedAt: now }],
    ['update', 'tables', src.tableId, { status: 'empty', billId: null, openedAt: null }],
  ];
  if (!moved.length) ops.shift();
  await db.batch(ops);
}

/** Hủy món (thu ngân) – có thể hủy 1 phần số lượng */
export async function voidItem(billId, itemId, qty, reason, by) {
  const apply = bill => {
    const items = [];
    for (const it of bill.items || []) {
      if (it.id !== itemId || it.void) { items.push(it); continue; }
      const mark = { void: true, voidReason: reason, voidBy: by, voidAt: Date.now() };
      if (qty >= it.qty) items.push({ ...it, ...mark });
      else { items.push({ ...it, qty: it.qty - qty }); items.push({ ...it, id: uid(), qty, ...mark }); }
    }
    return items;
  };
  await safeTxn(async tx => {
    const b = await tx.get('bills', billId);
    tx.update('bills', billId, { items: apply(b), updatedAt: Date.now() });
  }, async () => db.update('bills', billId, { items: apply(store.bills[billId]), updatedAt: Date.now() }));
}

/** Lưu giảm giá / phụ thu tạm */
export const saveAdjust = (billId, discount, surcharge) => db.update('bills', billId, { discount: discount || null, surcharge: surcharge || null });

/** Kiểm tra mặt hàng có theo dõi tồn kho không (mặc định các loại bia, nước ngọt, đồ uống) */
export function isTrackedItem(item) {
  if (!item) return false;
  if (item.trackStock === false) return false;
  if (item.trackStock === true) return true;
  if (item.categoryId === 'c8') return true;
  const c = store.categories.find(cat => cat.id === item.categoryId);
  if (c && /bia|rượu|nước|uống|giải khát/i.test(c.name)) return true;
  return false;
}

export function defaultUnit(name = '') {
  const n = String(name).toLowerCase();
  if (n.includes('lon')) return 'Lon';
  if (n.includes('chai')) return 'Chai';
  if (n.includes('thùng') || n.includes('két')) return 'Thùng';
  if (n.includes('suối') || n.includes('nước')) return 'Chai';
  return 'Lon';
}

export function formatStockQty(qty, packSize = 24, unit = 'Lon') {
  const q = Number(qty) || 0;
  if (q === 0) return { main: '0 ' + unit, packText: 'Hết hàng', isOut: true, isLow: false };
  if (q < 0) return { main: `${q} ${unit}`, packText: 'Âm kho', isOut: true, isLow: false };
  const packs = Math.floor(q / packSize);
  const remainder = q % packSize;
  let packText = '';
  if (packs > 0 && remainder > 0) {
    packText = `${packs} thùng + ${remainder} ${unit.toLowerCase()}`;
  } else if (packs > 0) {
    packText = `${packs} thùng chẵn`;
  } else {
    packText = `${remainder} ${unit.toLowerCase()}`;
  }
  return {
    main: `${q} ${unit}`,
    packText,
    isOut: false,
    isLow: q <= 10,
  };
}

/** Ghi nhật ký xuất nhập kho */
export async function recordStockLog(log) {
  try {
    const entry = { id: uid(), at: Date.now(), ...log };
    const doc = await db.get('settings', 'inventory_logs');
    if (!doc) {
      await db.set('settings', 'inventory_logs', { logs: [entry], updatedAt: Date.now() });
    } else {
      const logs = [entry, ...(doc.logs || [])].slice(0, 300);
      await db.set('settings', 'inventory_logs', { logs, updatedAt: Date.now() });
    }
  } catch (e) {
    console.warn('recordStockLog error:', e);
  }
}

/** Nhập hàng vào kho – cộng số lượng tồn và tổng nhập */
export async function importStock(menuId, qty, note = '', costPrice = null, by = '') {
  const m = store.menu.find(x => x.id === menuId);
  if (!m) throw new Error('Không tìm thấy mặt hàng');
  const addQty = Number(qty) || 0;
  if (addQty <= 0) throw new Error('Số lượng nhập phải lớn hơn 0');
  const patch = {
    stock: F.increment(addQty),
    totalImported: F.increment(addQty),
    trackStock: true,
  };
  if (costPrice != null && costPrice > 0) patch.costPrice = costPrice;
  await db.update('menu', menuId, patch);
  await recordStockLog({
    type: 'import',
    menuId,
    name: m.name,
    qty: addQty,
    unit: m.unit || defaultUnit(m.name),
    note,
    costPrice,
    by: by || store.user?.name || 'Thu Ngân',
  });
}

/** Kiểm kho / Điều chỉnh số lượng tồn thực tế */
export async function adjustStock(menuId, newStock, note = '', by = '') {
  const m = store.menu.find(x => x.id === menuId);
  if (!m) throw new Error('Không tìm thấy mặt hàng');
  const targetStock = Number(newStock) || 0;
  const current = Number(m.stock || 0);
  const diff = targetStock - current;
  await db.update('menu', menuId, { stock: targetStock, trackStock: true });
  await recordStockLog({
    type: 'adjust',
    menuId,
    name: m.name,
    oldStock: current,
    newStock: targetStock,
    diff,
    unit: m.unit || defaultUnit(m.name),
    note,
    by: by || store.user?.name || 'Thu Ngân',
  });
}

/** Thanh toán – trả về bill đã đóng & tự động trừ tồn kho mặt hàng đã bán */
export async function completePayment(billId, { discount, surcharge, pay }, by) {
  const now = Date.now(), day = dayKey(now);
  const yymmdd = day.slice(2).replace(/-/g, '');
  const finalize = (bill, code) => {
    const c = calc(bill, discount, surcharge);
    return {
      status: 'paid', code, discount: discount || null, surcharge: surcharge || null, pay,
      subtotal: c.subtotal, discountAmt: c.discountAmt, surchargeAmt: c.surchargeAmt, total: c.total, itemCount: c.count,
      closedAt: now, closedBy: by, day, updatedAt: now,
    };
  };

  // Gom các món không bị hủy để trừ kho cho những món theo dõi (bia, nước ngọt...)
  const getSoldItems = bill => {
    const map = {};
    for (const it of bill.items || []) {
      if (it.void) continue;
      if (!it.menuId) continue;
      map[it.menuId] = (map[it.menuId] || 0) + (Number(it.qty) || 1);
    }
    return map;
  };

  const result = await safeTxn(async tx => {
    const counter = await tx.get('counters', 'bill');
    const bill = await tx.get('bills', billId);
    const table = await tx.get('tables', bill.tableId);
    if (!bill || !ACTIVE.includes(bill.status)) throw new Error('Bill này đã được xử lý trên máy khác');
    const seq = counter?.day === day ? counter.seq + 1 : 1;
    const code = `HD${yymmdd}-${String(seq).padStart(3, '0')}`;
    const patch = finalize(bill, code);
    tx.set('counters', 'bill', { day, seq });
    tx.update('bills', billId, patch);
    if (table?.billId === billId) tx.update('tables', bill.tableId, { status: 'empty', billId: null, openedAt: null });

    // Tự động trừ số lượng trong kho khi xuất bán
    const soldMap = getSoldItems(bill);
    for (const [menuId, qty] of Object.entries(soldMap)) {
      const m = store.menu.find(x => x.id === menuId);
      if (m && isTrackedItem(m)) {
        tx.update('menu', menuId, {
          stock: F.increment(-qty),
          totalExported: F.increment(qty),
        });
      }
    }
    return { ...bill, ...patch };
  }, async () => {
    const bill = store.bills[billId];
    const d = new Date(now);
    const code = `HD${yymmdd}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
    const patch = finalize(bill, code);
    const ops = [
      ['update', 'bills', billId, patch],
      ['update', 'tables', bill.tableId, { status: 'empty', billId: null, openedAt: null }],
    ];

    // Tự động trừ số lượng trong kho khi xuất bán (batch)
    const soldMap = getSoldItems(bill);
    for (const [menuId, qty] of Object.entries(soldMap)) {
      const m = store.menu.find(x => x.id === menuId);
      if (m && isTrackedItem(m)) {
        ops.push(['update', 'menu', menuId, {
          stock: F.increment(-qty),
          totalExported: F.increment(qty),
        }]);
      }
    }
    await db.batch(ops);
    return { ...bill, ...patch };
  });

  // Ghi nhật ký xuất kho bán hàng
  const soldMap = getSoldItems(result);
  for (const [menuId, qty] of Object.entries(soldMap)) {
    const m = store.menu.find(x => x.id === menuId);
    if (m && isTrackedItem(m)) {
      recordStockLog({
        type: 'sale',
        menuId,
        name: m.name,
        qty,
        unit: m.unit || defaultUnit(m.name),
        billCode: result.code,
        by,
      }).catch(() => {});
    }
  }

  return result;
}

/** Hủy bill */
export async function cancelBill(billId, reason, by) {
  const b = store.bills[billId];
  const now = Date.now();
  await db.batch([
    ['update', 'bills', billId, { status: 'cancelled', cancelReason: reason, closedAt: now, closedBy: by, day: dayKey(now), updatedAt: now, total: 0 }],
    ['update', 'tables', b.tableId, { status: 'empty', billId: null, openedAt: null }],
  ]);
}

export const setAvailable = (menuId, available) => db.update('menu', menuId, { available });

