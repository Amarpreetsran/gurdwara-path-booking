// POST /.netlify/functions/notify  { ref: "ABC123", event: "...", rid?: "ABC123_2" }
// Called by the website and the committee page after something happens to a booking.
// Everything is read from the database here, so the caller cannot change what is sent; a message
// goes out only when the booking really is in that state, and each message only once (sendOnce).
//   booked    - booking made                         -> path_booking_confirmed
//   reported  - devotee tapped "I have paid"         -> path_payment_checking
//   payment   - receipt issued (path and/or seva)    -> path_bheta_received
//   notfound  - committee marked "Not received"      -> path_payment_not_found  (rid = the report)
//   moved     - devotee changed the date             -> path_date_changed
//   cancelled - committee cancelled the booking      -> path_booking_cancelled
//   void      - committee voided a receipt           -> path_receipt_void
//   refund    - committee recorded a refund          -> path_refund_issued
// Seva bheta without a path booking (reference S…), using the same templates:
//   seva_reported / seva_payment / seva_notfound / seva_void
import { getDoc, sendOnce, toNumber, TEMPLATES, TYPES, whenText, statusText, money, account, siteUrl, reasonText, cancelParams } from '../lib/gpb.mjs';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const EVENTS = ['booked', 'reported', 'payment', 'notfound', 'moved', 'cancelled', 'void', 'refund', 'seva_reported', 'seva_payment', 'seva_notfound', 'seva_void'];
const SEVA_LABEL = 'ਸੇਵਾ ਭੇਟਾ (ਗੁਰਦੁਆਰਾ ਸਾਹਿਬ) / Seva bheta for Gurdwara Sahib';
const dayText = iso => new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

async function sevaOnly(ref, event) {
  const d = await getDoc(`sevaonly/${ref}`);
  if (!d) return json(404, { error: 'no such seva' });
  const c = await getDoc(`sevacontacts/${ref}`);
  if (!c || !c.phone) return json(200, { ok: true, results: [], note: 'no phone' });
  const s = (await getDoc('settings/main')) || {};
  const to = toNumber(c.phone), url = siteUrl(), office = s.phone || 'ਗੁਰਦੁਆਰਾ ਦਫ਼ਤਰ / gurdwara office', r = d.receipt;
  const results = [], send = async (key, tpl, params) => results.push(await sendOnce(key, to, tpl, params, { ref, event }));
  if (event === 'seva_reported' && d.status === 'checking')
    await send(`${ref}_rep`, TEMPLATES.checking, [d.name, SEVA_LABEL, ref, money(d.amount), d.utr || '-']);
  if (event === 'seva_notfound' && d.status === 'rejected')
    await send(`${ref}_nf`, TEMPLATES.notfound, [d.name, ref, money(d.amount), d.utr || '-', office]);
  if (event === 'seva_payment' && d.status === 'verified' && r && !r.void)
    await send(`${ref}_rcpt`, TEMPLATES.payment, [`${money(r.amount)} ਸੇਵਾ ਭੇਟਾ / seva bheta`, SEVA_LABEL, dayText(r.date), ref, r.no,
      'ਸੇਵਾ ਭੇਟਾ, ਕੋਈ ਬਕਾਇਆ ਨਹੀਂ / Seva, nothing due', url ? `${url}/receipt.html?seva=${ref}` : `receipt ${r.no}`]);
  if (event === 'seva_void' && r && r.void)
    await send(`${ref}_void`, TEMPLATES.void, [d.name, ref, r.no, money(r.amount) + ' (ਸੇਵਾ ਭੇਟਾ / seva)', reasonText(r.void.reason), '-']);
  return json(200, { ok: true, results });
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  let ref, event, rid;
  try { ({ ref, event, rid } = await req.json()); } catch (e) { return json(400, { error: 'bad body' }); }
  ref = String(ref || '').toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(ref) || !EVENTS.includes(event)) return json(400, { error: 'bad request' });
  try {
    if (event.startsWith('seva_')) return await sevaOnly(ref, event);
    const l = await getDoc(`lookup/${ref}`);
    if (!l) return json(404, { error: 'no such booking' });
    const c = await getDoc(`contacts/${l.slot}`);
    if (!c || !c.phone) return json(404, { error: 'no phone for booking' });
    const s = (await getDoc('settings/main')) || {};
    const to = toNumber(c.phone), path = (TYPES[l.type] || { en: l.type }).en, gname = s.name || 'Gurdwara Sahib';
    const url = siteUrl(), office = s.phone || 'ਗੁਰਦੁਆਰਾ ਦਫ਼ਤਰ / gurdwara office';
    const results = [];
    const send = async (key, tpl, params, extra) => results.push(await sendOnce(key, to, tpl, params, { ref, event, ...(extra || {}) }));

    if (event === 'booked') {
      await send(`${ref}_booked`, TEMPLATES.booked,
        [path, whenText(l.type, l.start), gname, l.name, ref, statusText(l, s), url || 'the gurdwara booking page']);

    } else if (event === 'reported') {
      // Newest payment report, only while it is waiting to be checked.
      const n = l.reports || 0, r = n ? await getDoc(`reports/${ref}_${n}`) : null;
      if (r && !r.status && l.checking) {
        const total = (Number(r.amount) || 0) + (Number(r.seva) || 0);
        await send(`${ref}_rep${n}`, TEMPLATES.checking,
          [l.name, path, ref, r.seva ? `${money(total)} (path ${money(r.amount)} + seva ${money(r.seva)})` : money(total), r.utr || '-']);
      }

    } else if (event === 'notfound') {
      rid = String(rid || '');
      const r = rid.startsWith(ref + '_') ? await getDoc(`reports/${rid}`) : null;
      if (r && r.status === 'rejected') {
        const total = (Number(r.amount) || 0) + (Number(r.seva) || 0);
        await send(`${rid}_nf`, TEMPLATES.notfound, [l.name, ref, money(total), r.utr || '-', office]);
      }

    } else if (event === 'payment') {
      // One message per receipt not yet announced (newest three at most).
      const rec = l.receipts || [];
      for (let i = Math.max(0, rec.length - 3); i < rec.length; i++) {
        const r = rec[i]; if (r.void) continue;
        let on = 0, cash = 0;
        rec.slice(0, i + 1).forEach(x => { if (x.void) return; if (x.method === 'UPI') on += x.amount; else cash += x.amount; });
        const a = account({ ...l, paidOnline: on, paidCash: cash });
        const bal = a.due ? `${money(a.due)} due` : 'ਪੂਰੀ ਭੇਟਾ ਪ੍ਰਾਪਤ / Paid in full';
        await send(`${ref}_r${i + 1}`, TEMPLATES.payment,
          [money(r.amount), path, whenText(l.type, l.start), ref, r.no, bal, url ? `${url}/receipt.html?ref=${ref}&n=${i + 1}` : `receipt ${r.no}`], { receipt: r.no });
      }
      const sev = l.sevaReceipts || [];
      const pathBal = (() => { const a = account(l); return a.due ? `path bheta ${money(a.due)} due` : 'ਪੂਰੀ ਭੇਟਾ ਪ੍ਰਾਪਤ / Path bheta paid in full'; })();
      for (let i = Math.max(0, sev.length - 3); i < sev.length; i++) {
        const r = sev[i]; if (r.void) continue;
        await send(`${ref}_s${i + 1}`, TEMPLATES.payment,
          [`${money(r.amount)} ਸੇਵਾ ਭੇਟਾ / seva bheta for Gurdwara Sahib`, path, whenText(l.type, l.start), ref, r.no, pathBal,
            url ? `${url}/receipt.html?ref=${ref}&s=${i + 1}` : `receipt ${r.no}`], { receipt: r.no });
      }

    } else if (event === 'moved') {
      if (l.prev && !l.closed) {
        const oldDate = String(l.prev).split('__')[0];
        await send(`${ref}_mv_${l.slot}`, TEMPLATES.moved,
          [l.name, path, whenText(l.type, oldDate), whenText(l.type, l.start), ref, statusText(l, s)]);
      }

    } else if (event === 'cancelled') {
      if (l.closed === 'cancelled')
        await send(`${ref}_cancel`, TEMPLATES.cancelled, cancelParams(l, ref, reasonText(l.cancelReason), url));

    } else if (event === 'void') {
      const a = account(l), bal = l.closed ? '-' : a.due ? `${money(a.due)} due` : 'ਪੂਰੀ ਭੇਟਾ ਪ੍ਰਾਪਤ / Paid in full';
      for (const [list, kind] of [[l.receipts || [], 'path'], [l.sevaReceipts || [], 'seva']])
        for (const r of list) if (r.void)
          await send(`${ref}_void_${r.no}`, TEMPLATES.void,
            [l.name, ref, r.no, money(r.amount) + (kind === 'seva' ? ' (ਸੇਵਾ ਭੇਟਾ / seva)' : ''), reasonText(r.void.reason), bal], { receipt: r.no });

    } else if (event === 'refund') {
      (l.refunds || []).forEach((r, i) => r._i = i + 1);
      for (const r of l.refunds || [])
        await send(`${ref}_refund_${r.no}`, TEMPLATES.refund,
          [l.name, ref, money(r.amount), r.method, r.no, url ? `${url}/receipt.html?ref=${ref}&f=${r._i}` : `voucher ${r.no}`], { receipt: r.no });
    }
    return json(200, { ok: true, results });
  } catch (e) {
    console.error(e);
    return json(500, { error: String(e.message || e) });
  }
};
