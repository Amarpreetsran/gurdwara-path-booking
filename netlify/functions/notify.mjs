// POST /.netlify/functions/notify  { ref: "ABC123", event: "booked" | "payment" }
// Called by the website right after a booking, and by the committee page after a payment is confirmed.
// Everything is read from the database here, so the caller cannot change what is sent,
// and each message is sent only once (see sendOnce).
import { getDoc, sendOnce, toNumber, TEMPLATES, TYPES, whenText, statusText, money, account, siteUrl } from '../lib/gpb.mjs';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  let ref, event;
  try { ({ ref, event } = await req.json()); } catch (e) { return json(400, { error: 'bad body' }); }
  ref = String(ref || '').toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(ref) || !['booked', 'payment'].includes(event)) return json(400, { error: 'bad request' });
  try {
    const l = await getDoc(`lookup/${ref}`);
    if (!l) return json(404, { error: 'no such booking' });
    const c = await getDoc(`contacts/${l.slot}`);
    if (!c || !c.phone) return json(404, { error: 'no phone for booking' });
    const s = (await getDoc('settings/main')) || {};
    const to = toNumber(c.phone), path = (TYPES[l.type] || { en: l.type }).en, gname = s.name || 'Gurdwara Sahib';
    const url = siteUrl();
    const results = [];

    if (event === 'booked') {
      results.push(await sendOnce(`${ref}_booked`, to, TEMPLATES.booked,
        [path, whenText(l.type, l.start), gname, l.name, ref, statusText(l, s), url || 'the gurdwara booking page'],
        { ref, event }));
    } else {
      // One message per confirmed receipt that has not been announced yet (newest three at most).
      const rec = l.receipts || [];
      const start = Math.max(0, rec.length - 3);
      for (let i = start; i < rec.length; i++) {
        const r = rec[i];
        // Balance after this receipt.
        let on = 0, cash = 0;
        rec.slice(0, i + 1).forEach(x => { if (x.method === 'UPI') on += x.amount; else cash += x.amount; });
        const a = account({ ...l, paidOnline: on, paidCash: cash });
        const bal = a.due ? `${money(a.due)} due` : 'ਪੂਰੀ ਭੇਟਾ ਪ੍ਰਾਪਤ / Paid in full';
        results.push(await sendOnce(`${ref}_r${i + 1}`, to, TEMPLATES.payment,
          [money(r.amount), path, whenText(l.type, l.start), ref, r.no, bal, url ? `${url}/receipt.html?ref=${ref}&n=${i + 1}` : `receipt ${r.no}`],
          { ref, event, receipt: r.no }));
      }
      // Seva bheta receipts (own series): same message, the amount marked as seva for Gurdwara Sahib.
      const sev = l.sevaReceipts || [];
      const pathBal = (() => { const a = account(l); return a.due ? `path bheta ${money(a.due)} due` : 'ਪੂਰੀ ਭੇਟਾ ਪ੍ਰਾਪਤ / Path bheta paid in full'; })();
      for (let i = Math.max(0, sev.length - 3); i < sev.length; i++) {
        const r = sev[i];
        results.push(await sendOnce(`${ref}_s${i + 1}`, to, TEMPLATES.payment,
          [`${money(r.amount)} ਸੇਵਾ ਭੇਟਾ / seva bheta for Gurdwara Sahib`, path, whenText(l.type, l.start), ref, r.no, pathBal,
            url ? `${url}/receipt.html?ref=${ref}&s=${i + 1}` : `receipt ${r.no}`],
          { ref, event, receipt: r.no }));
      }
    }
    return json(200, { ok: true, results });
  } catch (e) {
    console.error(e);
    return json(500, { error: String(e.message || e) });
  }
};
