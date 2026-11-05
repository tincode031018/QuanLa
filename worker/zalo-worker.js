/**
 * Quán Lá – Cloudflare Worker trung gian gửi tin Zalo Bot
 * ------------------------------------------------------------
 * Cloudflare Worker bindings/secrets:
 *   ZALO_CONFIG     (KV namespace) Token bot được lưu server-side sau khi cấu hình trong app
 *   ADMIN_KEY       (Secret)  Khóa quản trị Worker, chỉ nhập lúc cấu hình bot
 *   BOT_TOKEN       (Secret, tùy chọn) Token cũ dùng dự phòng nếu KV chưa có token
 *   APP_KEY         (Secret)  Khóa gửi tin, phải trùng với Cài đặt > Gửi Zalo trong app
 *   WEBHOOK_SECRET  (Secret)  Chuỗi ngẫu nhiên 8-256 ký tự để xác thực webhook từ Zalo
 *   ALLOW_ORIGIN    (Text)    Origin app, ví dụ https://quan-la.web.app
 *
 * Đường dẫn:
 *   POST /configure { bot_token }          – lưu token vào KV (header X-Admin-Key)
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
      'Access-Control-Allow-Headers': 'Content-Type, X-App-Key, X-Admin-Key',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const getBotToken = async () => (await env.ZALO_CONFIG?.get('bot_token')) || env.BOT_TOKEN || '';

    // ---- App quản lý token bot ----
    if (url.pathname === '/configure' && req.method === 'POST') {
      if (!env.ADMIN_KEY) return json({ ok: false, error: 'Worker chưa cấu hình ADMIN_KEY' }, 503);
      if (req.headers.get('X-Admin-Key') !== env.ADMIN_KEY) return json({ ok: false, error: 'Sai khóa quản trị Worker' }, 401);
      if (!env.ZALO_CONFIG) return json({ ok: false, error: 'Worker chưa được gắn KV namespace ZALO_CONFIG' }, 503);
      let body;
      try { body = await req.json(); } catch { return json({ ok: false, error: 'Dữ liệu không hợp lệ' }, 400); }
      const botToken = typeof body?.bot_token === 'string' ? body.bot_token.trim() : '';
      if (botToken.length < 8 || botToken.length > 512) return json({ ok: false, error: 'BOT_TOKEN không hợp lệ' }, 400);
      await env.ZALO_CONFIG.put('bot_token', botToken);
      return json({ ok: true });
    }

    // ---- App gửi tin ----
    if (url.pathname === '/send' && req.method === 'POST') {
      if (req.headers.get('X-App-Key') !== env.APP_KEY) return json({ ok: false, error: 'Sai App Key' }, 401);
      let body;
      try { body = await req.json(); } catch { return json({ ok: false, error: 'Dữ liệu không hợp lệ' }, 400); }
      const { chat_id, text } = body || {};
      if (!chat_id || !text) return json({ ok: false, error: 'Thiếu chat_id hoặc text' }, 400);
      const botToken = await getBotToken();
      if (!botToken) return json({ ok: false, error: 'Chưa cấu hình BOT_TOKEN trong app hoặc Cloudflare Worker' }, 503);
      for (const part of chunk(String(text))) {
        const r = await send(botToken, chat_id, part);
        if (!r.ok) return json({ ok: false, error: r.description || r.message || 'Zalo từ chối tin nhắn', detail: r }, 502);
      }
      return json({ ok: true });
    }

    // ---- Đăng ký webhook (1 lần) ----
    if (url.pathname === '/updates' && req.method === 'GET') { const botToken = await getBotToken(); const r = await fetch(API(botToken) + "/deleteWebhook").then(() => fetch(API(botToken) + "/getUpdates")).then(r => r.json()).catch(e => ({ ok: false, error: String(e) })); return json(r); } if (url.pathname === '/setup' && req.method === 'GET') {
      if (url.searchParams.get('key') !== env.APP_KEY) return json({ ok: false, error: 'Sai key' }, 401);
      const botToken = await getBotToken();
      if (!botToken) return json({ ok: false, error: 'Chưa cấu hình BOT_TOKEN trong app hoặc Cloudflare Worker' }, 503);
      const r = await fetch(`${API(botToken)}/setWebhook`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `${url.origin}/webhook`, secret_token: "FbWBB5Wr-qe2tXQt-Z" }),
      }).then(r => r.json()).catch(e => ({ ok: false, error: String(e) }));
      return json({ webhook: `${url.origin}/webhook`, result: r });
    }

    // ---- Zalo gọi về: trả lời ID cuộc trò chuyện ----
    if (url.pathname === '/webhook') { if (req.method === 'GET') return new Response('OK');
      
      const body = await req.json().catch(() => ({}));
      const msg = body?.result?.message || body?.message;
      const text = (msg?.text || '').toLowerCase();
      const botToken = await getBotToken();
      if (msg?.chat?.id && /\/id|\bid\b|ma nhom|mã nhóm/.test(text)) {
        const type = msg.chat.chat_type === 'GROUP' ? 'nhóm' : 'cá nhân';
        if (botToken) await send(botToken, msg.chat.id, `ID cuộc trò chuyện ${type} này:\n${msg.chat.id}\n\nDán vào app Quán Lá > Quản lý > Cài đặt > Zalo.`);
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
