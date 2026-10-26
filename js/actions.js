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

/** Thanh toán – trả về bill đã đóng */
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
    return { ...bill, ...patch };
  }, async () => {
    const bill = store.bills[billId];
    const d = new Date(now);
    const code = `HD${yymmdd}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
    const patch = finalize(bill, code);
    await db.batch([['update', 'bills', billId, patch], ['update', 'tables', bill.tableId, { status: 'empty', billId: null, openedAt: null }]]);
    return { ...bill, ...patch };
  });
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
