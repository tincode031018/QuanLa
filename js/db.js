// ===== Lớp dữ liệu: 1 giao diện chung cho 2 chế độ =====
//  - local    : chế độ DEMO, lưu localStorage, đồng bộ giữa các tab trên cùng máy
//  - firebase : chạy thật, Firestore realtime + offline + Firebase Auth
import { FIREBASE_CONFIG, ACCOUNTS, SHOP_ID, FIREBASE_VERSION } from './config.js';
import { uid, clone, hashPin } from './utils.js';

const ARR = '__arrayUnion', INC = '__increment';
// Phép ghi đặc biệt (an toàn khi nhiều người ghi cùng lúc)
export const F = {
  arrayUnion: (...items) => ({ [ARR]: items }),
  increment: n => ({ [INC]: n }),
};
const isArr = v => v && typeof v === 'object' && ARR in v;
const isInc = v => v && typeof v === 'object' && INC in v;

export let db = null;

export async function initDB() {
  if (!FIREBASE_CONFIG) throw new Error('Chưa cấu hình Firebase. Hãy thêm FIREBASE_CONFIG trong js/config.js để chạy thật.');
  db = await createFirebase(FIREBASE_CONFIG);
  return db;
}

/* ------------------------------------------------------------------ */
/*  CHẾ ĐỘ DEMO – localStorage                                         */
/* ------------------------------------------------------------------ */
function createLocal() {
  const KEY = 'ql_db_v1';
  let data = load();
  const watchers = new Set();

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
  function persist(cols) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) { console.error(e); throw new Error('Bộ nhớ trình duyệt đã đầy'); }
    notify(cols);
  }
  function notify(cols) { for (const w of watchers) if (!cols || cols.has(w.col)) fire(w); }
  function fire(w) {
    setTimeout(() => {
      if (!w.active) return;
      w.cb(w.id ? getSync(w.col, w.id) : querySync(w.col, w.filters));
    }, 0);
  }
  window.addEventListener('storage', e => { if (e.key === KEY) { data = load(); notify(null); } });

  const col = c => (data[c] ||= {});
  const getSync = (c, id) => { const d = col(c)[id]; return d ? { id, ...clone(d) } : null; };
  function match(doc, filters = []) {
    return filters.every(([f, op, v]) => {
      const x = doc[f];
      switch (op) {
        case '==': return x === v;
        case '!=': return x !== v;
        case 'in': return v.includes(x);
        case '>=': return x >= v;
        case '<=': return x <= v;
        case '>': return x > v;
        case '<': return x < v;
        default: return true;
      }
    });
  }
  const querySync = (c, filters) => Object.entries(col(c)).map(([id, d]) => ({ id, ...clone(d) })).filter(d => match(d, filters));
  function applyPatch(doc, patch) {
    for (const [k, v] of Object.entries(patch)) {
      if (isArr(v)) {
        const arr = Array.isArray(doc[k]) ? doc[k] : [];
        for (const it of v[ARR]) if (!arr.some(a => JSON.stringify(a) === JSON.stringify(it))) arr.push(clone(it));
        doc[k] = arr;
      } else if (isInc(v)) doc[k] = (doc[k] || 0) + v[INC];
      else if (v === undefined) delete doc[k];
      else doc[k] = clone(v);
    }
    return doc;
  }
  function strip(d) { const o = { ...d }; delete o.id; return o; }
  function writeSet(c, id, d) { col(c)[id] = applyPatch({}, strip(d)); }
  function writeUpdate(c, id, p) {
    const doc = col(c)[id];
    if (!doc) throw new Error(`Không tìm thấy dữ liệu (${c}/${id})`);
    applyPatch(doc, strip(p));
  }

  return {
    mode: 'local',
    newId: uid,
    isAuthed: () => true,
    authRole: () => null,
    async signIn(role, pin) {
      const s = getSync('settings', 'main');
      if (!s?.pins?.[role] || s.pins[role] !== hashPin(pin)) throw new Error('Mã PIN không đúng');
      return true;
    },
    async signOut() {},
    async changePin(role, pin) {
      const s = col('settings').main; s.pins = { ...(s.pins || {}), [role]: hashPin(pin) }; persist(new Set(['settings']));
    },
    async get(c, id) { return getSync(c, id); },
    async list(c, filters) { return querySync(c, filters); },
    watch(c, filters, cb) {
      const w = { col: c, filters, cb, active: true }; watchers.add(w); fire(w);
      return () => { w.active = false; watchers.delete(w); };
    },
    watchDoc(c, id, cb) {
      const w = { col: c, id, cb, active: true }; watchers.add(w); fire(w);
      return () => { w.active = false; watchers.delete(w); };
    },
    async add(c, d) { const id = uid(); writeSet(c, id, d); persist(new Set([c])); return id; },
    async set(c, id, d) { writeSet(c, id, d); persist(new Set([c])); },
    async update(c, id, p) { writeUpdate(c, id, p); persist(new Set([c])); },
    async remove(c, id) { delete col(c)[id]; persist(new Set([c])); },
    async batch(ops) { // [['set'|'update'|'remove', col, id, data]]
      const cols = new Set();
      for (const [op, c, id, d] of ops) { cols.add(c); op === 'set' ? writeSet(c, id, d) : op === 'update' ? writeUpdate(c, id, d) : delete col(c)[id]; }
      persist(cols);
    },
    async txn(fn) {
      data = load();
      const writes = [];
      const tx = {
        get: async (c, id) => getSync(c, id),
        set: (c, id, d) => writes.push(['set', c, id, d]),
        update: (c, id, p) => writes.push(['update', c, id, p]),
      };
      const result = await fn(tx);
      const cols = new Set();
      for (const [op, c, id, d] of writes) { cols.add(c); op === 'set' ? writeSet(c, id, d) : writeUpdate(c, id, d); }
      persist(cols);
      return result;
    },
    exportAll: () => clone(data),
    importAll(obj) { data = obj || {}; persist(null); },
    resetAll() { data = {}; localStorage.removeItem(KEY); notify(null); },
  };
}

/* ------------------------------------------------------------------ */
/*  CHẾ ĐỘ THẬT – Firebase (tải thư viện từ CDN, chỉ tải khi cần)      */
/* ------------------------------------------------------------------ */
async function createFirebase(cfg) {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const [appM, authM, fs] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`),
  ]);
  const app = appM.initializeApp(cfg);
  const auth = authM.getAuth(app);
  let fdb;
  try {
    fdb = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
  } catch { fdb = fs.getFirestore(app); }

  await new Promise(r => { const u = authM.onAuthStateChanged(auth, () => { u(); r(); }); });

  const colRef = c => fs.collection(fdb, 'shops', SHOP_ID, c);
  const docRef = (c, id) => fs.doc(fdb, 'shops', SHOP_ID, c, id);
  const conv = d => {
    const o = {};
    for (const [k, v] of Object.entries(d)) {
      if (k === 'id') continue;
      if (isArr(v)) o[k] = fs.arrayUnion(...v[ARR]);
      else if (isInc(v)) o[k] = fs.increment(v[INC]);
      else if (v === undefined) o[k] = fs.deleteField();
      else o[k] = v;
    }
    return o;
  };
  const convSet = d => { const o = conv(d); for (const k in o) if (d[k] === undefined) delete o[k]; return o; };
  const q = (c, filters = []) => (filters.length ? fs.query(colRef(c), ...filters.map(([f, op, v]) => fs.where(f, op, v))) : colRef(c));
  const list = s => s.docs.map(d => ({ id: d.id, ...d.data() }));
  const one = s => (s.exists() ? { id: s.id, ...s.data() } : null);
  // Ghi KHÔNG chờ server -> vẫn dùng được khi mất mạng (Firestore tự đồng bộ lại)
  const fire = p => { p.catch(e => window.dispatchEvent(new CustomEvent('db-error', { detail: e }))); return Promise.resolve(); };
  const emailRole = () => {
    const e = auth.currentUser?.email;
    return e === ACCOUNTS.cashier ? 'cashier' : e === ACCOUNTS.order ? 'order' : null;
  };

  return {
    mode: 'firebase',
    newId: () => fs.doc(colRef('bills')).id,
    isAuthed: () => !!auth.currentUser,
    authRole: emailRole,
    async signIn(role, pin) {
      try { await authM.signInWithEmailAndPassword(auth, ACCOUNTS[role], pin); return true; }
      catch (e) {
        if (/network/i.test(e.code || '')) throw new Error('Không có mạng – cần Internet để đăng nhập');
        throw new Error('Mã PIN không đúng');
      }
    },
    signOut: () => authM.signOut(auth),
    async changePin(role, pin) {
      if (emailRole() !== role) throw new Error('Chỉ đổi được mã PIN của tài khoản đang đăng nhập. Đổi PIN Order trong Firebase Console.');
      await authM.updatePassword(auth.currentUser, pin);
    },
    async get(c, id) { return one(await fs.getDoc(docRef(c, id))); },
    async list(c, filters) { return list(await fs.getDocs(q(c, filters))); },
    watch(c, filters, cb) { return fs.onSnapshot(q(c, filters), s => cb(list(s)), e => window.dispatchEvent(new CustomEvent('db-error', { detail: e }))); },
    watchDoc(c, id, cb) { return fs.onSnapshot(docRef(c, id), s => cb(one(s)), e => window.dispatchEvent(new CustomEvent('db-error', { detail: e }))); },
    async add(c, d) { const r = fs.doc(colRef(c)); fire(fs.setDoc(r, convSet(d))); return r.id; },
    set: (c, id, d) => fire(fs.setDoc(docRef(c, id), convSet(d))),
    update: (c, id, p) => fire(fs.updateDoc(docRef(c, id), conv(p))),
    remove: (c, id) => fire(fs.deleteDoc(docRef(c, id))),
    batch(ops) {
      const b = fs.writeBatch(fdb);
      for (const [op, c, id, d] of ops) {
        if (op === 'set') b.set(docRef(c, id), convSet(d));
        else if (op === 'update') b.update(docRef(c, id), conv(d));
        else b.delete(docRef(c, id));
      }
      return fire(b.commit());
    },
    txn(fn) {
      return fs.runTransaction(fdb, t => fn({
        get: async (c, id) => one(await t.get(docRef(c, id))),
        set: (c, id, d) => t.set(docRef(c, id), convSet(d)),
        update: (c, id, p) => t.update(docRef(c, id), conv(p)),
      }));
    },
  };
}
