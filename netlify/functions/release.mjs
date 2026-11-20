// Runs every hour. Cancels bookings that have received no advance within the hold time
// (committee setting, default 48 hours), so the dates open for other sangat; the devotee must book again. A booking is released only when:
//   - a bheta amount is set for it, nothing has been received (online or at the gurdwara),
//   - no payment report is waiting to be checked,
//   - it has not been closed already, and its path date has not yet started.
// The dates are freed, the phone number is removed, and the booking is kept as "Released, not paid"
// so the devotee sees why on "My booking" and the committee sees it under that filter.
import { queryEq, getDoc, updateDoc, deleteDoc, TYPES, addDays, istToday, holdHours } from '../lib/gpb.mjs';

const unpaid = l => l && !l.closed && Number(l.total) > 0 && !Number(l.paidOnline) && !Number(l.paidCash) && !l.checking;

export default async () => {
  const out = [];
  try {
    const s = (await getDoc('settings/main')) || {};
    const h = holdHours(s);
    if (!h) return new Response(JSON.stringify({ off: true }), { headers: { 'Content-Type': 'application/json' } });
    const today = istToday();
    const open = await queryEq('lookup', { closed: '' });
    for (const { id: ref, data: l } of open) {
      if (!unpaid(l) || !l.slot || !(l.start > today)) continue;
      const v = await getDoc(`slots/${l.slot}`);
      if (!v || !v.bookedAt) continue;
      if (Date.parse(v.bookedAt) + h * 3600e3 > Date.now()) continue;
      const fresh = await getDoc(`lookup/${ref}`);           // check again just before releasing
      if (!unpaid(fresh) || fresh.slot !== l.slot) continue;
      await updateDoc(`lookup/${ref}`, { closed: 'expired', releasedAt: new Date() });
      const [date, type, seat] = l.slot.split('__');
      const days = (TYPES[type] || { days: 1 }).days;
      for (let i = 0; i < days; i++) await deleteDoc(`slots/${addDays(date, i)}__${type}__${seat}`);
      await deleteDoc(`contacts/${l.slot}`);
      out.push(ref);
    }
    console.log('Released unpaid bookings:', JSON.stringify(out));
  } catch (e) {
    console.error('Release failed', e);
  }
  return new Response(JSON.stringify({ released: out }), { headers: { 'Content-Type': 'application/json' } });
};

export const config = { schedule: '0 * * * *' };
