// ===== Gửi thông tin lên nhóm Zalo =====
//  Cách A (tự động): App -> Cloudflare Worker (giữ Bot Token) -> Zalo Bot API -> nhóm
//  Cách B (1 chạm) : Nút chia sẻ của điện thoại / Sao chép dán vào Zalo PC
import { store } from './store.js';
import { modal, toast, icon } from './ui.js';
import { esc } from './utils.js';
import { printHTML, textToImage } from './bill.js';

export const autoReady = () => {
  const z = store.settings.zalo;
  return !!(z.auto && z.workerUrl && z.appKey);
};

export async function sendAuto(chatId, text) {
  const z = store.settings.zalo;
  const url = z.workerUrl.replace(/\/+$/, '') + '/send';
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'X-App-Key': z.appKey },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || 'HTTP ' + res.status);
    return true;
  } finally { clearTimeout(t); }
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch {}
    ta.remove(); return ok;
  }
}

const canShare = () => typeof navigator.share === 'function';

/**
 * Gửi nội dung tới Zalo theo cấu hình.
 * target: 'kitchen' | 'bill' | 'report'
 * opts: { title, print: () => html, autoPrint: bool }
 */
export async function deliver(target, text, opts = {}) {
  const z = store.settings.zalo;
  const enabled = target === 'kitchen' ? z.sendKitchen : target === 'bill' ? z.sendBill : true;
  if (opts.autoPrint && opts.print) printHTML(opts.print());
  if (!enabled) return false;
  const chatId = target === 'kitchen' ? z.kitchenChatId : (z.billChatId || z.kitchenChatId);
  if (autoReady() && chatId) {
    try {
      await sendAuto(chatId, text);
      toast(target === 'kitchen' ? 'Đã gửi phiếu bếp lên Zalo ✓' : 'Đã gửi lên nhóm Zalo ✓');
      return true;
    } catch (e) {
      console.warn('Zalo auto failed', e);
      toast('Gửi Zalo tự động lỗi – hãy chia sẻ thủ công', 'warn', 3500);
    }
  }
  shareSheet(text, opts);
  return false;
}

// Bảng chia sẻ thủ công
export function shareSheet(text, { title = 'Gửi Zalo', print, imageTitle } = {}) {
  const mobileShare = canShare();
  modal({
    title: `${icon('zalo')} ${esc(title)}`,
    body: `<pre class="preview">${esc(text)}</pre>
      <p class="xs muted mt">${mobileShare
        ? 'Bấm <b>Chia sẻ Zalo</b> → chọn Zalo → chọn nhóm của quán → Gửi.'
        : 'Bấm <b>Sao chép</b> rồi dán (Ctrl+V) vào nhóm trên Zalo PC / Zalo Web.'}</p>`,
    foot: `
      ${mobileShare ? `<button class="btn btn-zalo" data-a="share">${icon('share')} Chia sẻ Zalo</button>` : ''}
      ${mobileShare ? `<button class="btn" data-a="img">${icon('image')} Gửi ảnh</button>` : ''}
      <button class="btn ${mobileShare ? '' : 'btn-zalo'}" data-a="copy">${icon('copy')} Sao chép</button>
      ${!mobileShare ? `<a class="btn" href="https://chat.zalo.me" target="_blank" rel="noopener">Mở Zalo Web</a>` : ''}
      ${print ? `<button class="btn" data-a="print">${icon('print')} In</button>` : ''}`,
    onMount: api => {
      api.el.addEventListener('click', async e => {
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (!a) return;
        if (a === 'share') {
          try { await navigator.share({ text }); api.close(true); } catch (err) { if (err.name !== 'AbortError') { await copyText(text); toast('Đã sao chép – dán vào Zalo', 'info'); } }
        } else if (a === 'img') {
          const blob = await textToImage(text, imageTitle);
          const file = new File([blob], 'quan-la.png', { type: 'image/png' });
          if (navigator.canShare?.({ files: [file] })) {
            try { await navigator.share({ files: [file] }); api.close(true); } catch {}
          } else {
            const a2 = document.createElement('a'); a2.href = URL.createObjectURL(blob); a2.download = 'quan-la.png'; a2.click();
            toast('Đã tải ảnh về máy', 'info');
          }
        } else if (a === 'copy') {
          if (await copyText(text)) toast('Đã sao chép – dán vào nhóm Zalo'); else toast('Không sao chép được', 'err');
        } else if (a === 'print') printHTML(print());
      });
    },
  });
}
