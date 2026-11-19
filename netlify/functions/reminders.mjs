// Runs every day at 9:00 AM India time (03:30 UTC).
// Sends a reminder to every booking whose aarambh (first day) is tomorrow.
import { queryEq, getDoc, sendOnce, toNumber, TEMPLATES, TYPES, whenText, statusText, istTomorrow } from '../lib/gpb.mjs';

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
    console.log('Reminders for', day, JSON.stringify(out));
  } catch (e) {
    console.error('Reminders failed', e);
  }
  return new Response(JSON.stringify({ day, out }), { headers: { 'Content-Type': 'application/json' } });
};

export const config = { schedule: '30 3 * * *' };
