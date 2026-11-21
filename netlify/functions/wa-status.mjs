// WhatsApp delivery status (Meta webhook).
// In Meta: your app → WhatsApp → Configuration → Webhook:
//   Callback URL:  https://<your site>/.netlify/functions/wa-status
//   Verify token:  the same word as the Netlify key WA_VERIFY_TOKEN
//   then subscribe to the "messages" field.
// When a message cannot be delivered (for example the number is not on WhatsApp), the message record
// is marked "failed" and the committee page shows "WhatsApp not delivered, please call".
import crypto from 'node:crypto';
import { queryEq, updateDoc } from '../lib/gpb.mjs';

const env = k => (process.env[k] || '').trim();
const ORDER = { sending: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

export default async (req) => {
  const u = new URL(req.url);
  if (req.method === 'GET') {
    const ok = u.searchParams.get('hub.mode') === 'subscribe' && env('WA_VERIFY_TOKEN') && u.searchParams.get('hub.verify_token') === env('WA_VERIFY_TOKEN');
    return new Response(ok ? (u.searchParams.get('hub.challenge') || '') : 'Forbidden', { status: ok ? 200 : 403 });
  }
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  const raw = await req.text();
  const secret = env('WA_APP_SECRET');
  if (secret) {
    const sig = String(req.headers.get('x-hub-signature-256') || '');
    const want = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
    if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return new Response('bad signature', { status: 401 });
  }
  let body; try { body = JSON.parse(raw); } catch (e) { return new Response('bad body', { status: 400 }); }
  const statuses = [];
  for (const en of body.entry || []) for (const ch of en.changes || []) for (const st of (ch.value && ch.value.statuses) || []) statuses.push(st);
  for (const st of statuses) {
    try {
      const hits = await queryEq('notices', { messageId: String(st.id || '') });
      for (const { id, data: n } of hits) {
        if ((ORDER[st.status] ?? 0) <= (ORDER[n.status] ?? 0) && st.status !== 'failed') continue;   // never go backwards
        const up = { status: st.status, statusAt: new Date(Number(st.timestamp) * 1000 || Date.now()) };
        if (st.status === 'failed') {
          const er = (st.errors || [])[0] || {};
          up.error = `${er.code || ''} ${er.title || er.message || 'not delivered'}${er.error_data && er.error_data.details ? ' · ' + er.error_data.details : ''}`.trim().slice(0, 500);
        }
        await updateDoc(`notices/${id}`, up);
      }
    } catch (e) { console.error('status', st.id, e); }
  }
  return new Response('ok', { status: 200 });
};
