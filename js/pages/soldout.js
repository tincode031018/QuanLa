// ===== Báo hết món (Order & Thu ngân) =====
import { store } from '../store.js';
import { icon, setTitle, toast } from '../ui.js';
import { esc, money, norm } from '../utils.js';
import { setAvailable } from '../actions.js';

let el, q = '';
function render() {
  const nq = norm(q);
  const sold = store.menu.filter(m => m.available === false).length;
  el.querySelector('#slist').innerHTML = store.categories.map(c => {
    const items = store.menu.filter(m => m.categoryId === c.id && (!nq || norm(m.name).includes(nq)));
    return items.length ? `<div class="section-title">${esc(c.name)}</div><div class="card">${items.map(m => `
      <div class="admin-row"><div class="ar-main"><b style="${m.available === false ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(m.name)}</b><span class="xs muted">${m.price > 0 ? money(m.price) : esc(m.priceLabel || 'Chưa có giá')}</span></div>
      <span class="pill ${m.available === false ? 'st-cancelled' : 'st-open'}">${m.available === false ? 'Hết' : 'Còn'}</span>
      <label class="switch"><input type="checkbox" data-id="${m.id}" ${m.available !== false ? 'checked' : ''}><span></span></label></div>`).join('')}</div>` : '';
  }).join('');
  el.querySelector('#scount').textContent = sold ? `${sold} món đang hết` : 'Tất cả món đều còn';
}
export default {
  async mount(root) {
    el = root; setTitle('Báo hết món'); q = '';
    el.innerHTML = `<div class="page-head"><h1>Báo hết món</h1><span class="pill st-waiting" id="scount"></span></div>
      <p class="small muted mb">Tắt công tắc khi món hết – tất cả máy Order sẽ thấy ngay và không gọi được món đó.</p>
      <div class="searchbox mb">${icon('search')}<input class="input" id="sq" placeholder="Tìm món…"></div>
      <div id="slist"></div>`;
    render();
    const onChange = async e => { const t = e.target; if (t.dataset.id) { await setAvailable(t.dataset.id, t.checked); toast(t.checked ? 'Đã bật lại món' : 'Đã báo hết món', 'info'); } };
    const onInput = e => { if (e.target.id === 'sq') { q = e.target.value; render(); } };
    el.addEventListener('change', onChange); el.addEventListener('input', onInput);
    return () => { el.removeEventListener('change', onChange); el.removeEventListener('input', onInput); };
  },
  update(keys) { if (keys.has('menu') || keys.has('categories')) render(); },
};
