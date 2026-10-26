// ===== Trạng thái dùng chung + đồng bộ realtime =====
import { db } from './db.js';
import { dayKey, hashPin } from './utils.js';

export const DEFAULT_SETTINGS = {
  shopName: 'QUÁN LÁ',
  slogan: 'Cơm nhà – Vị quê',
  address: '61k/Xã Hòa Phú,H.Long Hồ,Vĩnh Long',
  phone: '0983.759.580',
  ownerName: 'Hương',
  bank: { bin: '', accountNo: '', accountName: '' },
  discountPresets: [5, 10, 15, 20],
  surchargePresets: [
    { label: 'Phụ thu lễ', type: 'percent', value: 10 },
    { label: 'Phụ thu Tết', type: 'percent', value: 20 },
    { label: 'Phí phục vụ', type: 'percent', value: 5 },
  ],
  noteChips: ['Ít cay', 'Không cay', 'Không hành', 'Ít đá', 'Không đá', 'Ít ngọt', 'Mang về', 'Làm nhanh'],
  voidReasons: ['Khách đổi món', 'Khách hủy', 'Bếp hết món', 'Order nhập sai'],
  zalo: { auto: false, workerUrl: '', appKey: '', kitchenChatId: '', billChatId: '', sendKitchen: true, sendBill: true },
  print: { autoBill: false, autoKitchen: false, footer: 'Cảm ơn quý khách – Hẹn gặp lại!', showQR: true },
  longSitMinutes: 120,
  lockMinutes: 0,
};

export const store = {
  user: null,
  settings: structuredClone(DEFAULT_SETTINGS),
  areas: [], tables: [], categories: [], menu: [],
  bills: {},          // bill đang mở (open / waiting)
  todayBills: [],     // bill đã đóng hôm nay (thu ngân)
  loaded: new Set(),
  unseen: new Set(),  // bill có cập nhật mới chưa xem (thu ngân)
};

const subs = new Set();
const changed = new Set();
let timer = 0;
export function onChange(fn) { subs.add(fn); return () => subs.delete(fn); }
export function emit(key) {
  changed.add(key);
  if (timer) return;
  timer = setTimeout(() => { timer = 0; const keys = new Set(changed); changed.clear(); subs.forEach(f => f(keys)); }, 16);
}

function deepMerge(base, over) {
  if (!over) return structuredClone(base);
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(over)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])
      ? { ...base[k], ...v } : v;
  }
  return out;
}
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(String(b.name), 'vi', { numeric: true });

let unsubs = [];
export function startSync() {
  stopSync();
  const w = (col, key, sort = byOrder) => db.watch(col, [], list => { store[key] = list.sort(sort); store.loaded.add(key); emit(key); });
  unsubs.push(
    db.watchDoc('settings', 'main', d => { store.settings = deepMerge(DEFAULT_SETTINGS, d); store.loaded.add('settings'); store.settingsExists = !!d; emit('settings'); }),
    w('areas', 'areas'), w('tables', 'tables'), w('categories', 'categories'), w('menu', 'menu'),
    db.watch('bills', [['status', 'in', ['open', 'waiting']]], list => {
      const m = {}; list.forEach(b => (m[b.id] = b)); store.bills = m; store.loaded.add('bills'); emit('bills');
    }),
  );
  if (store.user?.role === 'cashier') {
    unsubs.push(db.watch('bills', [['day', '==', dayKey()]], list => { store.todayBills = list; emit('today'); }));
  }
}
export function stopSync() { unsubs.forEach(u => u && u()); unsubs = []; }

/* ---------- Truy vấn nhanh ---------- */
export const tableById = id => store.tables.find(t => t.id === id);
export const billOfTable = t => (t?.billId ? store.bills[t.billId] : null);
export const menuById = id => store.menu.find(m => m.id === id);
/* ---------- Khởi tạo dữ liệu ban đầu ---------- */
export async function seedIfNeeded() {
  const s = await db.get('settings', 'main');
  if (s?.menuVersion >= 3 && s?.staffVersion >= 1) return false;
  if (s?.menuVersion >= 3) {
    const cleanup = (await db.list('staff')).map(x => ['remove', 'staff', x.id]);
    cleanup.push(['update', 'settings', 'main', { staffVersion: 1 }]);
    await db.batch(cleanup);
    return false;
  }
  const ops = [];
  if (!s) {
    const settings = structuredClone(DEFAULT_SETTINGS);
    if (db.mode === 'local') settings.pins = { order: hashPin('111111'), cashier: hashPin('999999') };
    ops.push(['set', 'settings', 'main', settings]);
    ops.push(['set', 'counters', 'bill', { day: '', seq: 0 }]);
    ops.push(['set', 'areas', 'a1', { name: 'Trong nhà', order: 1 }]);
    ops.push(['set', 'areas', 'a2', { name: 'Sân vườn', order: 2 }]);
    for (let i = 1; i <= 10; i++) {
      ops.push(['set', 'tables', 't' + String(i).padStart(2, '0'), { name: 'Bàn ' + i, areaId: i <= 6 ? 'a1' : 'a2', order: i, status: 'empty', billId: null }]);
    }
  }
  const cats = [
    ['c1', 'Các món khai vị'], ['c2', 'Các món bò'], ['c3', 'Đặc biệt Quán Lá'],
    ['c4', 'Ốc - Sò huyết - Nghêu - Càng ghẹ'], ['c5', 'Món lẩu'], ['c6', 'Lẩu đặc biệt'],
    ['c7', 'Lẩu rắn'], ['c8', 'Bia - Rượu'], ['c9', 'Món mực - tôm - ếch'],
    ['c10', 'Món gà'], ['c11', 'Món cá nướng + chiên'], ['c12', 'Món chiên + xào'],
    ['c13', 'Món gà lúa 100% nguyên con'], ['c14', 'Món nướng & đặc biệt khác'],
  ];
  cats.forEach(([id, name], i) => ops.push(['set', 'categories', id, { name, order: i + 1 }]));
  // price is used for fixed prices; priceLabel preserves ranges/market prices.
  // A non-fixed-price item requires the cashier to set its actual price before ordering.
  const menu = [
    ['c1', 'Đậu Hủ Giòn + Sả Ớt + Chà Bông', null, '45.000 - 50.000'],
    ['c1', 'Rau Luộc + Kho Quẹt', 20000], ['c1', 'Combo Kho Quẹt', 100000], ['c1', 'Cút Lộn Muối Me', 70000],
    ['c1', 'Bắp Xào Tôm Khô', 40000], ['c1', 'Rau Xào Tôm Khô', 40000], ['c1', 'Rau Xào Thập Cẩm', 40000],
    ['c1', 'Rau Muống Xào Tỏi + Xào Chua', 40000], ['c1', 'Khổ Qua Chà Bông', 40000], ['c1', 'Tỏi Nướng Giấy Bạc', 40000],
    ['c1', 'Gỏi Xoài Khô Mực + Cá Lóc', 90000], ['c1', 'Khoai Tây Chiên', 40000],
    ['c1', 'Cá Lòng Tong, Cá Chốt', null, 'Giá chung với Cá Bống Kho, Rau Luộc'], ['c1', 'Cá Bống Kho, Rau Luộc', 100000],
    ['c2', 'Bò Lúc Lắc Khoai Tây', 100000, null, 'sticker'], ['c2', 'Bò Xào Hành + Rau Muống + Cải Thìa', 100000],
    ['c2', 'Bò Xào + Nướng Sa Tế', 100000], ['c2', 'Bò Cuộn Kim Châm', 100000], ['c2', 'Gỏi Bò Bóp Thấu', null, '170.000 - 200.000'],
    ['c3', 'Gà Nướng Muối Ớt + Bánh Bao', null, '170.000 - 300.000'],
    ['c3', 'Chả Cá Thác Lác Hấp Cải Thìa + Dưa Cải + Chiên Sả Ớt', 200000],
    ['c3', 'Sụn Gà Chiên Nước Mắm + Chiên', 80000], ['c3', 'Mực Trứng 100% Trứng', 100000], ['c3', 'Bao Tử Hấp Tiêu', 100000],
    ['c3', 'Bao Tử, Dồi Trường Chiên Giòn + Xào Sả Ớt', null, '90.000 - 100.000'], ['c3', 'Dê Hấp Tía Tô + Nướng + Xào', 200000],
    ['c3', 'Đậu Hủ Khói Lửa', 100000], ['c3', 'Chim Sẻ Rô Ti', 100000], ['c3', 'Cá Trạch Đồng Nấu Mẻ', 200000],
    ['c3', 'Cua + Ghẹ + Rang Me (Đặt Trước)', null, 'Thời Giá'],
    ['c4', 'Càng Ghẹ Rang Me + Muối', 80000], ['c4', 'Ốc Hương Sả + Xào Tỏi + Muối', 90000],
    ['c4', 'Sò Huyết Me + Muối + Lacoste', 80000], ['c4', 'Nghêu Hấp Thái - Gừng Sả', 70000], ['c4', 'Ốc Bươu Tiêu + Sả', 90000],
    ['c5', 'Lẩu Thái Hải Sản + Thập Cẩm', null, '200.000 - 250.000'],
    ['c5', 'Lẩu Cá Bóp + Lẩu Lươn', null, '200.000 - 250.000 - 300.000'], ['c5', 'Lẩu Cua Đồng', null, '200.000 - 250.000 - 300.000'],
    ['c5', 'Lẩu Gà Chanh Ớt', null, '200.000 - 250.000 - 300.000'], ['c5', 'Lẩu Cá Hồi + Điêu Hồng + Cá Kèo', null, '200.000 - 250.000'],
    ['c5', 'Lẩu Cá Chạch Đồng Nấu Mẻ + Cá Kèo Nấu Mẻ', null, '200.000 - 250.000 - 300.000'],
    ['c6', 'Lẩu Chả Cá Thác Lác Khổ Qua 100% Chả Cá Thác Lác', null, '200.000 - 250.000 - 300.000'],
    ['c6', 'Lẩu Bao Tử + Ốc Bươu + Chả Cá', null, '250.000 - 300.000 - 350.000'], ['c6', 'Lẩu Cá Bóp', null, '200.000 - 250.000'],
    ['c7', 'Rắn Xào Sả Ớt + Nướng Mắm Tiêu', 130000], ['c7', 'Rắn Xào Củ Hành + Sa Tế', 130000],
    ['c7', 'Rắn Chiên Nước Mắm + Giòn', 130000], ['c7', 'Lẩu Rắn Hầm Sả', 200000],
    ['c8', 'Sài Gòn Gold / Chill Lon / Chill Chai / Xanh Lon / Chai Lùn / Đỏ', null, 'Giá cũ (bị sticker che)'],
    ['c8', 'Sài Gòn Trắng Lon', 15000], ['c8', 'Sài Gòn Trắng Chai', 11500], ['c8', 'Heineken Lon', 20000],
    ['c8', 'Tiger Bạc Lon', 17000], ['c8', 'Tiger Nâu Lon', 16000], ['c8', 'Larue Lon', 15000], ['c8', 'Nước Ngọt Lon', 15000],
    ['c8', 'Nước Ngọt Chai (Đồng Giá)', null, 'Giá chưa xác định (sticker che)'], ['c8', 'Nước Suối', 10000],
    ['c9', 'Mực Trứng Hấp Gừng + Chiên + Nướng', 100000], ['c9', 'Mực Nang Hấp Gừng + Chiên + Nướng', 90000],
    ['c9', 'Bạch Tuột Chiên Mắm + Chiên + Nướng', 90000], ['c9', 'Tôm Sốt Thái', 200000], ['c9', 'Tôm Tái Mù Tạt', 200000],
    ['c9', 'Tôm Hấp Bia + Nướng Sa Tế', 90000], ['c9', 'Ếch Xào Lăn', 100000], ['c9', 'Ếch Chiên Bơ Tỏi + Nước Mắm + Giòn', 90000], ['c9', 'Ếch Nướng Rau Răm', 90000],
    ['c10', 'Gà Chiên Nước Mắm + Bơ Tỏi', 90000], ['c10', 'Mề Gà Chiên Nước Mắm + Bơ Tỏi', 90000],
    ['c10', 'Chân Gà Chiên Nước Mắm + Giòn', 80000], ['c10', 'Chân Gà Hấp Hành', 80000], ['c10', 'Mề Gà Xào Mướp + Xào Hành', 80000],
    ['c11', 'Cá Cam Nướng Giấy Bạc', null, 'Thời Giá'], ['c11', 'Cá Saba Nướng + Chiên Sốt Cà', null, 'Thời Giá'],
    ['c11', 'Cá Kèo Nướng + Chiên Nước Mắm', 100000], ['c11', 'Cá Trứng Chiên Giòn', 90000], ['c11', 'Vây Cá Hồi Mắm + Sa Tế', null, 'Giá theo sticker'],
    ['c11', 'Cá Bống, Lòng Tong, Cá Chốt Chiên Giòn', 70000], ['c11', 'Cá Điêu Hồng Chiên Sốt Cà + Chiên Giòn', null, 'Thời Giá'],
    ['c12', 'Cơm Chiên Hải Sản + Cá Mặn', null, 'Giá chưa xác định (sticker che)'], ['c12', 'Cơm Chiên Bò', 90000],
    ['c12', 'Cơm Chiên Tỏi + Trứng Tỏi', null, '40.000 - 50.000'], ['c12', 'Mì Xào Bò + Thập Cẩm + Hải Sản', 90000],
    ['c12', 'Bao Tử Heo, Dồi Trường Heo Thập Cẩm + Dưa Cải + Chua Ngọt', 100000], ['c12', 'Mực Xào Thập Cẩm + Dưa Cải', 90000],
    ['c12', 'Bạch Tuộc Xào Thập Cẩm + Dưa Cải', 90000], ['c12', 'Mực, Bạch Tuộc Chiên Nước Mắm + Chiên Giòn', 90000],
    ['c13', 'Gà Ta Nấu Cháo + Hấp Cải Ngọt', null, 'Thỏa Giá'], ['c13', 'Rang Muối + Dưa Cải + Nấm Rơm', null, 'Thỏa Giá'],
    ['c13', 'Gà Ta Hấp Nước Mắm', null, 'Thỏa Giá'], ['c13', 'Gà Tre Nấu Cháo', null, 'Thỏa Giá'], ['c13', 'Gà Tre Hấp Mắm + Hấp Cải', null, 'Thỏa Giá'],
    ['c14', 'Sụn Gà Chiên Nước Mắm Giòn + Bơ Tỏi', 80000], ['c14', 'Mực Trứng 100% Trứng (Hấp Gừng + Chiên Mắm)', 100000],
    ['c14', 'Vú Heo Tươi 100% Nướng Chảo + Sa Tế', 100000], ['c14', 'Sườn Non Nướng + Chiên Nước Mắm', 100000],
    ['c14', 'Ba Chỉ Nướng + Xào Khóm Hành', 100000], ['c14', 'Vú Heo Chiên Nước Mắm', 100000],
    ['c14', 'Ốc Hương Hấp Gừng Sả + Hấp Thái + Bơ Tỏi', 120000], ['c14', 'Cá Lù Đù 1 Nắng Sả Ớt', 90000],
    ['c14', 'Cá Chạch Đồng 100% Giòn Mắm', 100000], ['c14', 'Cá Tai Tượng + Cá Lóc + Cá Chẽm (Đặt Trước)', null, 'Thời Giá'],
  ];
  menu.forEach(([cat, name, price, priceLabel, priceNote], i) => ops.push(['set', 'menu', 'm' + (i + 1), { name, price, priceLabel: priceLabel || '', priceNote: priceNote || '', categoryId: cat, available: true, order: i + 1 }]));
  for (const old of await db.list('staff')) ops.push(['remove', 'staff', old.id]);
  // Remove only obsolete seeded IDs beyond the current catalog. Existing
  // documents that are being updated are overwritten once in this batch.
  for (const old of await db.list('menu')) {
    const n = Number(old.id.slice(1));
    if (/^m\d+$/.test(old.id) && n > menu.length) ops.push(['remove', 'menu', old.id]);
  }
  for (const old of await db.list('categories')) {
    const n = Number(old.id.slice(1));
    if (/^c\d+$/.test(old.id) && n > cats.length) ops.push(['remove', 'categories', old.id]);
  }
  ops.push(s
    ? ['update', 'settings', 'main', { menuVersion: 3, staffVersion: 1 }]
    : ['set', 'settings', 'main', { ...DEFAULT_SETTINGS, ...(db.mode === 'local' ? { pins: { order: hashPin('111111'), cashier: hashPin('999999') } } : {}), menuVersion: 3, staffVersion: 1 }]);
  await db.batch(ops);
  return !s;
}
