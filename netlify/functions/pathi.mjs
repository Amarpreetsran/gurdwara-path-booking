// POST /.netlify/functions/pathi  { id, pin, action?: "view" | "unavailable" | "avail" | "usual", dates?, ref?, value?, text? }
//   unavailable: days the Pathi Singh cannot come.  avail: for one coming path, "any" | "day" | "night" | "no" | "".
//   usual: a short note such as "weekends, nights only".
// The Pathi Singh's own page. Checks the 4-digit PIN (stored only as a hash), and sends back only
// that Pathi Singh's rosters and payment vouchers. Five wrong PINs lock the page for 15 minutes.
import crypto from 'node:crypto';
import { getDoc, updateDoc, query, queryEq, istToday, addDays } from '../lib/gpb.mjs';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const sha = t => crypto.createHash('sha256').update(t).digest('hex');

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  let b; try { b = await req.json(); } catch (e) { return json(400, { error: 'bad body' }); }
  const id = String(b.id || ''), pin = String(b.pin || '');
  if (!/^[A-Za-z0-9]{20}$/.test(id) || !/^\d{4}$/.test(pin)) return json(400, { error: 'pin' });
  try {
    const [p, k] = [await getDoc(`pathis/${id}`), await getDoc(`pathipins/${id}`)];
    if (!p || !k || p.active === false) return json(404, { error: 'notfound' });
    if (Number(k.lockUntil) > Date.now()) return json(429, { error: 'locked' });
    const good = crypto.timingSafeEqual(Buffer.from(sha(id + ':' + pin)), Buffer.from(String(k.hash || '').padEnd(64, '0').slice(0, 64)));
    if (!good) {
      const fails = (Number(k.fails) || 0) + 1;
      await updateDoc(`pathipins/${id}`, fails >= 5 ? { fails: 0, lockUntil: Date.now() + 15 * 60e3 } : { fails });
      return json(401, { error: fails >= 5 ? 'locked' : 'pin' });
    }
    if (k.fails) await updateDoc(`pathipins/${id}`, { fails: 0 });

    let unavailable = p.unavailable || [];
    if (b.action === 'unavailable') {
      const today = istToday();
      unavailable = [...new Set((Array.isArray(b.dates) ? b.dates : []).map(String).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= today))].sort().slice(0, 60);
      await updateDoc(`pathis/${id}`, { unavailable, unavailableAt: new Date() });
    }
    // Coming paths (next 90 days) the Pathi Singh can offer to do seva for. Only date, path and family name are shown.
    const today = istToday(), until = addDays(today, 90);
    const paths = (await queryEq('lookup', { closed: '' })).map(x => ({ ref: x.id, type: x.data.type, start: x.data.start, name: x.data.name }))
      .filter(x => (x.type === 'akhand' || x.type === 'sehaj') && x.start >= today && x.start <= until).sort((a, b) => a.start < b.start ? -1 : 1);
    const refs = new Set(paths.map(x => x.ref));
    let avail = Object.fromEntries(Object.entries(p.avail || {}).filter(([k]) => refs.has(k))), usual = p.usual || '';
    if (b.action === 'avail') {
      const ref = String(b.ref || ''), v = String(b.value || '');
      if (!refs.has(ref) || !['any', 'day', 'night', 'no', ''].includes(v)) return json(400, { error: 'bad' });
      if (v) avail[ref] = v; else delete avail[ref];
      await updateDoc(`pathis/${id}`, { avail, availAt: new Date() });
    }
    if (b.action === 'usual') { usual = String(b.text || '').trim().slice(0, 200); await updateDoc(`pathis/${id}`, { usual }); }
    const from = addDays(istToday(), -60);
    const rosters = (await query('rosters', [['pathiIds', 'ARRAY_CONTAINS', id]])).map(x => x.data).filter(r => r.start >= from)
      .map(r => ({ ref: r.ref, type: r.type, start: r.start, name: r.name, place: r.place, note: r.note || '',
        rauls: (r.rauls || []).map(x => ({ from: x.from, to: x.to, label: x.label || '', name: x.name, mine: x.pathiId === id })) }));
    const vouchers = (await query('expenses', [['pathiId', 'EQUAL', id]])).map(x => x.data)
      .map(e => ({ no: e.no, amount: e.amount, method: e.method, date: e.date, ref: e.ref || '', void: !!e.void, pathType: e.pathType || '', pathDate: e.pathDate || '' }));
    const s = (await getDoc('settings/main')) || {};
    return json(200, { ok: true, name: p.name, unavailable, paths, avail, usual, rosters, vouchers, gurdwara: { name: s.name || 'Gurdwara Sahib', phone: s.phone || '' } });
  } catch (e) {
    console.error(e);
    return json(500, { error: 'server' });
  }
};
