// Runs every day at 9:00 AM India time (03:30 UTC).
// Sends a reminder to every booking whose aarambh (first day) is tomorrow.
import { queryEq, query, getDoc, sendOnce, toNumber, TEMPLATES, TYPES, whenText, statusText, istTomorrow, addDays, raulText } from '../lib/gpb.mjs';

export default async () => {
  const day = istTomorrow();
  const out = [];
  try {
    const s = (await getDoc('settings/main')) || {};
    const gname = s.name || 'Gurdwara Sahib', office = s.phone || 'the gurdwara office';
    const slots = await queryEq('slots', { start: day, part: 0 });
    for (const { id, data: v } of slots) {
      const c = await getDoc(`contacts/${id}`);
      if (!c || !c.phone || !c.ref) continue;
      const l = await getDoc(`lookup/${c.ref}`);
      if (!l || l.closed) continue;
      const path = (TYPES[v.type] || { en: v.type }).en;
      out.push(await sendOnce(`${c.ref}_rem_${day}`, toNumber(c.phone), TEMPLATES.reminder,
        [v.name, path, whenText(v.type, v.start), gname, c.ref, statusText(l), office],
        { ref: c.ref, event: 'reminder' }));
    }
    // Pathi Singhs: a reminder the day before each day they have rauls (or the Sehaj Path bhog).
    const rosters = await query('rosters', [['start', 'GREATER_THAN_OR_EQUAL', addDays(day, -2)], ['start', 'LESS_THAN_OR_EQUAL', day]]);
    for (const { data: ro } of rosters) {
      const l = await getDoc(`lookup/${ro.ref}`);
      if (!l || l.closed) continue;
      const mine = {};
      for (const x of ro.rauls || []) if (x.pathiId && (x.from ? x.from.slice(0, 10) === day : ro.start === day)) (mine[x.pathiId] = mine[x.pathiId] || []).push(x);
      for (const [pid, list] of Object.entries(mine)) {
        const p = await getDoc(`pathis/${pid}`);
        if (!p || !p.phone || p.active === false) continue;
        out.push(await sendOnce(`${ro.ref}_prem_${pid}_${day}`, toNumber(p.phone), TEMPLATES.pathiReminder,
          [p.name, `${(TYPES[ro.type] || { en: ro.type }).en} · ${ro.name} ਪਰਿਵਾਰ / family`, whenText(ro.type, day).replace(/ \(bhog.*$/, ''), list.map(raulText).join('; '), ro.place || gname],
          { ref: ro.ref, event: 'pathi_reminder', pathiId: pid }));
      }
    }
    console.log('Reminders for', day, JSON.stringify(out));
  } catch (e) {
    console.error('Reminders failed', e);
  }
  return new Response(JSON.stringify({ day, out }), { headers: { 'Content-Type': 'application/json' } });
};

export const config = { schedule: '30 3 * * *' };
