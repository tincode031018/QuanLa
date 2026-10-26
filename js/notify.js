// ===== Thông báo: chuông (Web Audio – không cần file âm thanh), rung, toast =====
import { store, onChange, emit } from './store.js';
import { toast } from './ui.js';

let ctx = null;
export function unlockAudio() {
  try { ctx ||= new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); } catch {}
}
export function ding(kind = 'new') {
  navigator.vibrate?.(kind === 'pay' ? [120, 60, 120] : 90);
  if (!ctx) return;
  const t = ctx.currentTime;
  const notes = kind === 'pay' ? [784, 988, 1319] : [880, 1175];
  notes.forEach((f, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    const s = t + i * 0.16;
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.35, s + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.35);
    o.connect(g).connect(ctx.destination); o.start(s); o.stop(s + 0.4);
  });
}

// Theo dõi bill: báo thu ngân khi có món mới / bàn yêu cầu tính tiền
let prev = null;
export function watchBills() {
  onChange(keys => {
    if (!keys.has('bills')) return;
    const cur = {};
    for (const b of Object.values(store.bills)) cur[b.id] = { n: (b.items || []).length, status: b.status, b };
    const me = store.user;
    if (prev && me?.role === 'cashier') {
      let sound = null;
      for (const [id, c] of Object.entries(cur)) {
        const p = prev[id];
        const fromOther = c.b.lastBy && c.b.lastBy !== me.name;
        if (c.status === 'waiting' && p?.status !== 'waiting' && (c.b.requestedBy !== me.name)) {
          toast(`${c.b.tableName} yêu cầu tính tiền`, 'warn', 4000); sound = 'pay'; store.unseen.add(id);
        } else if (c.n > (p?.n || 0) && fromOther) {
          const added = (c.b.items || []).slice(p?.n || 0).reduce((s, i) => s + i.qty, 0);
          toast(`${c.b.tableName}: ${p ? 'gọi thêm' : 'gọi'} ${added} món (${c.b.lastBy})`, 'info', 3500);
          sound ||= 'new'; store.unseen.add(id);
        }
      }
      for (const id of store.unseen) if (!cur[id]) store.unseen.delete(id);
      if (sound) { ding(sound); emit('unseen'); }
    }
    prev = cur;
    const waiting = Object.values(store.bills).filter(b => b.status === 'waiting').length;
    document.querySelectorAll('[data-badge="orders"]').forEach(el => (el.textContent = waiting || ''));
  });
}
export function resetWatch() { prev = null; }
