// POST /.netlify/functions/committee  (committee page only: needs the signed-in member's Firebase token)
//   { action: "resend",  key }              send a failed WhatsApp message again (same wording)
//   { action: "receipt", ref, kind, n }     send a receipt to the family again (kind "path" or "seva", n = 1, 2 …)
//   { action: "advance", ref }              gentle reminder that the advance / balance is due
//   { action: "roster",  ref }              send each Pathi Singh their rauls for this path
//   { action: "backup" }                    email the backup now (Pardhan only)
import { getDoc, updateDoc, sendOnce, sendTemplate, toNumber, TEMPLATES, TYPES, whenText, statusText, money, account, siteUrl,
  committeeUser, addLog, raulText, pathiLink } from '../lib/gpb.mjs';
import { runBackup } from '../lib/backup.mjs';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  let b; try { b = await req.json(); } catch (e) { return json(400, { error: 'bad body' }); }
  const need = b.action === 'backup' ? 'admin' : 'sevadar';
  let u; try { u = await committeeUser(req, need); } catch (e) { return json(500, { error: String(e.message || e) }); }
  if (!u) return json(403, { error: 'not allowed' });
  try {
    if (b.action === 'resend') {
      const key = String(b.key || '');
      if (!/^[A-Za-z0-9_\-./]{3,200}$/.test(key) || key.includes('..')) return json(400, { error: 'bad key' });
      const n = await getDoc(`notices/${key}`);
      if (!n) return json(404, { error: 'no such message' });
      const id = await sendTemplate(n.to, n.template, n.params || []);
      await updateDoc(`notices/${key}`, { status: 'sent', messageId: id || '', error: '', resentAt: new Date(), resentBy: u.name || u.uid });
      await addLog(u, 'WhatsApp sent again', n.ref || '', n.template);
      return json(200, { ok: true });
    }

    if (b.action === 'backup') {
      const r = await runBackup();
      await addLog(u, 'Backup emailed', '', r.summary);
      return json(200, { ok: true, ...r });
    }

    const ref = String(b.ref || '').toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(ref)) return json(400, { error: 'bad ref' });
    const l = await getDoc(`lookup/${ref}`);
    if (!l) return json(404, { error: 'no such booking' });
    const s = (await getDoc('settings/main')) || {}, url = siteUrl(), path = (TYPES[l.type] || { en: l.type }).en, stamp = Date.now().toString(36);

    if (b.action === 'roster') {
      const ro = await getDoc(`rosters/${ref}`);
      if (!ro || !(ro.rauls || []).length) return json(404, { error: 'no roster' });
      const results = [], byPathi = {};
      for (const x of ro.rauls) if (x.pathiId) (byPathi[x.pathiId] = byPathi[x.pathiId] || []).push(x);
      for (const [pid, list] of Object.entries(byPathi)) {
        const p = await getDoc(`pathis/${pid}`);
        if (!p || !p.phone || p.active === false) { results.push({ pathi: pid, error: 'no phone' }); continue; }
        const mine = list.map(raulText).join('; ');
        // Same rauls are not sent twice; a changed roster is.
        const sig = Buffer.from(mine).toString('base64url').slice(-24);
        results.push(await sendOnce(`${ref}_roster_${pid}_${sig}`, toNumber(p.phone), TEMPLATES.pathiRoster,
          [p.name, `${path} · ${l.name} ਪਰਿਵਾਰ / family`, whenText(l.type, l.start), ro.place || s.name || 'Gurdwara Sahib', mine, pathiLink(pid)],
          { ref, event: 'roster', pathiId: pid }));
      }
      await addLog(u, 'Roster sent to Pathi Singhs', ref, `${results.filter(x => x.sent).length} sent`);
      return json(200, { ok: true, results });
    }

    const c = await getDoc(`contacts/${l.slot}`);
    if (!c || !c.phone) return json(404, { error: 'no phone for booking' });
    const to = toNumber(c.phone);

    if (b.action === 'receipt') {
      const kind = b.kind === 'seva' ? 'seva' : 'path', i = Math.round(Number(b.n)) - 1;
      const list = (kind === 'seva' ? l.sevaReceipts : l.receipts) || [], r = list[i];
      if (!r || r.void) return json(404, { error: 'no such receipt' });
      const a = account(l);
      const params = kind === 'seva'
        ? [`${money(r.amount)} ਸੇਵਾ ਭੇਟਾ / seva bheta for Gurdwara Sahib`, path, whenText(l.type, l.start), ref, r.no,
            a.due ? `path bheta ${money(a.due)} due` : 'ਪੂਰੀ ਭੇਟਾ ਪ੍ਰਾਪਤ / Path bheta paid in full', url ? `${url}/receipt.html?ref=${ref}&s=${i + 1}` : `receipt ${r.no}`]
        : [money(r.amount), path, whenText(l.type, l.start), ref, r.no, a.due ? `${money(a.due)} due` : 'ਪੂਰੀ ਭੇਟਾ ਪ੍ਰਾਪਤ / Paid in full',
            url ? `${url}/receipt.html?ref=${ref}&n=${i + 1}` : `receipt ${r.no}`];
      const res = await sendOnce(`${ref}_${kind}${i + 1}_again_${stamp}`, to, TEMPLATES.payment, params, { ref, event: 'receipt_again', receipt: r.no });
      await addLog(u, 'Receipt sent again on WhatsApp', ref, r.no);
      return json(res.error ? 502 : 200, res.error ? { error: res.error } : { ok: true });
    }

    if (b.action === 'advance') {
      const a = account(l);
      if (l.closed || !a.due) return json(409, { error: 'nothing due' });
      const res = await sendOnce(`${ref}_adv_${stamp}`, to, TEMPLATES.advance,
        [l.name, path, whenText(l.type, l.start), ref, statusText(l, s), url || 'the gurdwara booking page'], { ref, event: 'advance' });
      await addLog(u, 'Payment reminder sent', ref, money(a.due) + ' due');
      return json(res.error ? 502 : 200, res.error ? { error: res.error } : { ok: true });
    }
    return json(400, { error: 'unknown action' });
  } catch (e) {
    console.error(e);
    return json(500, { error: String(e.message || e) });
  }
};
