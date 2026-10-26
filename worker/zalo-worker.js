/**
 * Quán Lá – Cloudflare Worker trung gian gửi tin Zalo Bot
 * ------------------------------------------------------------
 * Biến môi trường (Settings > Variables and Secrets):
 *   BOT_TOKEN       (Secret)  Token bot nhận từ "Zalo Bot Manager"
 *   APP_KEY         (Secret)  Mật khẩu tự đặt, nhập giống hệt trong app (Cài đặt > Zalo > App Key)
 *   WEBHOOK_SECRET  (Secret)  Chuỗi ngẫu nhiên 8-256 ký tự để xác thực webhook từ Zalo
 *   ALLOW_ORIGIN    (Text)    Tên miền của app, ví dụ https://quan-la.web.app  (bỏ trống = cho phép tất cả)
 *
 * Đường dẫn:
 *   POST /send      { chat_id, text }      – app gọi để gửi tin (header X-App-Key)
 *   GET  /setup?key=APP_KEY                – đăng ký webhook (chạy 1 lần)
 *   POST /webhook                          – Zalo gọi về; nhắn "/id" trong nhóm để bot trả lời ID nhóm
 */
const API = token => `https://bot-api.zaloplatforms.com/bot${token}`;
const MAX = 2000; // giới hạn ký tự mỗi tin của Zalo Bot

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-App-Key',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (!env.BOT_TOKEN) return json({ ok: false, error: 'Chưa cấu hình BOT_TOKEN' }, 500);

    // ---- App gửi tin ----
    if (url.pathname === '/send' && req.method === 'POST') {
      if (req.headers.get('X-App-Key') !== env.APP_KEY) return json({ ok: false, error: 'Sai App Key' }, 401);
      let body;
      try { body = await req.json(); } catch { return json({ ok: false, error: 'Dữ liệu không hợp lệ' }, 400); }
      const { chat_id, text } = body || {};
      if (!chat_id || !text) return json({ ok: false, error: 'Thiếu chat_id hoặc text' }, 400);
      for (const part of chunk(String(text))) {
        const r = await send(env.BOT_TOKEN, chat_id, part);
        if (!r.ok) return json({ ok: false, error: r.description || r.message || 'Zalo từ chối tin nhắn', detail: r }, 502);
      }
      return json({ ok: true });
    }

    // ---- Đăng ký webhook (1 lần) ----
    if (url.pathname === '/setup' && req.method === 'GET') {
      if (url.searchParams.get('key') !== env.APP_KEY) return json({ ok: false, error: 'Sai key' }, 401);
      const r = await fetch(`${API(env.BOT_TOKEN)}/setWebhook`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `${url.origin}/webhook`, secret_token: env.WEBHOOK_SECRET }),
      }).then(r => r.json()).catch(e => ({ ok: false, error: String(e) }));
      return json({ webhook: `${url.origin}/webhook`, result: r });
    }

    // ---- Zalo gọi về: trả lời ID cuộc trò chuyện ----
    if (url.pathname === '/webhook' && req.method === 'POST') {
      if (env.WEBHOOK_SECRET && req.headers.get('X-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) return json({ message: 'Unauthorized' }, 403);
      const body = await req.json().catch(() => ({}));
      const msg = body?.result?.message || body?.message;
      const text = (msg?.text || '').toLowerCase();
      if (msg?.chat?.id && /\/id|\bid\b|ma nhom|mã nhóm/.test(text)) {
        const type = msg.chat.chat_type === 'GROUP' ? 'nhóm' : 'cá nhân';
        await send(env.BOT_TOKEN, msg.chat.id, `🆔 ID cuộc trò chuyện ${type} này:\n${msg.chat.id}\n\nDán vào app Quán Lá > Quản lý > Cài đặt > Zalo.`);
      }
      return json({ message: 'Success' });
    }

    if (url.pathname === '/') return json({ ok: true, service: 'Quán Lá – Zalo relay' });
    return json({ ok: false, error: 'Not found' }, 404);
  },
};

async function send(token, chat_id, text) {
  try {
    const r = await fetch(`${API(token)}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, text }),
    });
    return await r.json();
  } catch (e) { return { ok: false, message: String(e) }; }
}

// Tách tin dài theo dòng, mỗi phần <= 2000 ký tự
function chunk(text) {
  if (text.length <= MAX) return [text];
  const parts = []; let cur = '';
  for (const line of text.split('\n')) {
    if ((cur + '\n' + line).length > MAX) { if (cur) parts.push(cur); cur = line.slice(0, MAX); }
    else cur = cur ? cur + '\n' + line : line;
  }
  if (cur) parts.push(cur);
  return parts;
}
