// Shared settings: path types, timings, occasions and date helpers.
// To change timings or add a path, edit TYPES below (and the type list in firestore.rules).
window.GPB = (function () {
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const add = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const fmtShort = s => parse(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const fmtLong = s => parse(s).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const fmtDow = s => parse(s).toLocaleDateString('en-IN', { weekday: 'short' });

  const TYPES = [
    { key: 'akhand', pa: 'ਅਖੰਡ ਪਾਠ ਸਾਹਿਬ', en: 'Akhand Path Sahib', days: 2,
      when: d => `Arambh ${fmtShort(d)} morning · Bhog ${fmtShort(add(d, 2))} morning` },
    { key: 'sehaj', pa: 'ਸਹਿਜ ਪਾਠ ਦਾ ਭੋਗ', en: 'Sehaj Path · Bhog', days: 1, when: () => 'Bhog in the morning diwan' },
    { key: 'sukh-am', pa: 'ਸੁਖਮਨੀ ਸਾਹਿਬ', en: 'Sukhmani Sahib · Morning', days: 1, when: () => '7:00 AM' },
    { key: 'sukh-pm', pa: 'ਸੁਖਮਨੀ ਸਾਹਿਬ', en: 'Sukhmani Sahib · Evening', days: 1, when: () => '5:00 PM' }
  ];
  const OCCASIONS = ['Birthday', 'Wedding anniversary', 'New home (griha pravesh)', 'Remembrance (barsi)',
    'Child birth / naming', 'Shukrana (thanksgiving)', 'New business', 'Other'];

  const today = iso(new Date());
  const first = add(today, 1);               // bookings open from tomorrow
  const last = (() => { const d = new Date(); d.setMonth(d.getMonth() + 6); return iso(d); })(); // six months ahead

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const typeOf = k => TYPES.find(t => t.key === k);
  // Each path has a number of "places" (seats) that can run at the same time.
  // A booking takes one place; its id is date__path__place, e.g. 2026-12-05__akhand__2.
  const slotId = (date, key, seat) => `${date}__${key}__${seat}`;
  const makeRef = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let r = ''; for (let i = 0; i < 6; i++) r += a[Math.floor(Math.random() * a.length)]; return r; };

  const MAX_PLACES = 10; // also set in firestore.rules
  function capOf(settings, key) {
    const n = parseInt(settings && settings.capacity && settings.capacity[key], 10);
    return n >= 1 ? Math.min(n, MAX_PLACES) : 1;
  }
  // Places still free for this path starting on this date (empty list = fully booked or closed).
  function freeSeats(t, date, slots, settings) {
    const closed = (settings && settings.closed) || [];
    if (date < first || date > last) return [];
    for (let i = 0; i < t.days; i++) if (closed.includes(add(date, i))) return [];
    const out = [];
    for (let seat = 1; seat <= capOf(settings, t.key); seat++) {
      let ok = true;
      for (let i = 0; i < t.days; i++) if (slots[slotId(add(date, i), t.key, seat)]) { ok = false; break; }
      if (ok) out.push(seat);
    }
    return out;
  }
  const isFree = (t, date, slots, settings) => freeSeats(t, date, slots, settings).length > 0;
  const bookingsOn = (t, date, slots) => Object.values(slots).filter(v => v.type === t.key && v.date === date)
    .sort((a, b) => (a.seat || 1) - (b.seat || 1));

  // Online date changes are allowed within 24 hours of making the booking (enforced in firestore.rules too).
  const CHANGE_HOURS = 24;
  const CUTOFF_TEXT = 'within 24 hours of booking';
  const bookedMs = v => { const b = v && v.bookedAt; if (!b) return 0;
    if (typeof b === 'string') return Date.parse(b);
    if (b.toMillis) return b.toMillis();
    return (b.seconds || 0) * 1000; };
  const changeDeadline = v => bookedMs(v) + CHANGE_HOURS * 3600e3;
  const canReschedule = v => bookedMs(v) > 0 && Date.now() < changeDeadline(v) && v.start > iso(new Date());
  const fmtTime = ms => new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const phoneKey = p => String(p || '').replace(/\D/g, '').slice(-10);
  function waLink(phone, text) {
    let d = String(phone || '').replace(/\D/g, '');
    if (d.length === 11 && d[0] === '0') d = d.slice(1);
    if (d.length === 10) d = '91' + d;
    return 'https://wa.me/' + d + '?text=' + encodeURIComponent(text);
  }
  // UPI payment: amount per path is set by the committee (0 = no online payment for that path).
  const feeOf = (settings, key) => { const n = Number(settings && settings.fees && settings.fees[key]); return n > 0 ? Math.round(n) : 0; };
  function upiLink(settings, amount, ref) {
    return 'upi://pay?pa=' + encodeURIComponent(settings.upi).replace('%40', '@') + '&pn=' + encodeURIComponent(settings.payee || settings.name || 'Gurdwara Sahib') +
      '&am=' + amount + '&cu=INR&tn=' + encodeURIComponent('Path booking ' + ref);
  }
  function confirmText(o) {
    const t = typeOf(o.type) || { en: o.type };
    return `Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh.\n` +
      `${o.moved ? 'Your booking has been moved' : 'Your booking is confirmed'}: ${t.en} at ${o.gname} on ${fmtLong(o.date)}` +
      `${t.days > 1 ? ` (bhog ${fmtLong(add(o.date, 2))})` : ''}, for ${o.name} parivar.\n` +
      `Booking reference: ${o.ref}\n` +
      (o.deadline && o.deadline > Date.now() ? `To change the date online (until ${fmtTime(o.deadline)}), open ${o.url} and tap "Change my booking".` : `Booking page: ${o.url}`) +
      (o.phone ? `\nGurdwara office: ${o.phone}` : '');
  }


  // ---------- Bheta accounts ----------
  // Each booking keeps: total (bheta for that path), discount (₹ off when the whole amount is paid
  // online), paidOnline and paidCash (only amounts the committee has confirmed), and receipts.
  const ADVANCE_PCT = 20;   // at least this % must be paid online as advance (also in firestore.rules)
  const discountOf = settings => { const n = Number(settings && settings.onlineDiscount);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : 500; };
  const money = n => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
  const advanceOf = total => Math.ceil(total * ADVANCE_PCT / 100);
  const bhogDate = (type, start) => { const t = typeOf(type); return t && t.days > 1 ? add(start, 2) : start; };
  function account(l) {
    l = l || {};
    const total = Number(l.total) || 0, disc = Number(l.discount) || 0;
    const online = Number(l.paidOnline) || 0, cash = Number(l.paidCash) || 0, paid = online + cash;
    const fullOnline = Math.max(0, total - disc);
    const target = cash > 0 ? total : fullOnline;          // discount only when nothing is paid in cash
    const due = Math.max(0, target - paid);
    const advance = advanceOf(total);
    const advanceDue = Math.max(0, advance - online);
    let state;
    if (l.closed === 'noshow') state = 'noshow';
    else if (l.closed === 'cancelled') state = 'cancelled';
    else if (!total) state = 'free';
    else if (!due) state = 'paid';
    else if (l.checking) state = 'checking';
    else if (!paid) state = 'due';
    else state = 'partial';
    return { total, disc, online, cash, paid, fullOnline, target, due, advance, advanceDue, state };
  }
  const STATES = {
    due: ['ਅਗਾਊਂ ਭੇਟਾ ਬਾਕੀ', 'Advance due'],
    checking: ['ਜਾਂਚ ਅਧੀਨ', 'Payment being checked'],
    partial: ['ਅੰਸ਼ਕ ਭੇਟਾ ਪ੍ਰਾਪਤ', 'Part paid, balance due'],
    paid: ['ਪੂਰੀ ਭੇਟਾ ਪ੍ਰਾਪਤ', 'Fully paid'],
    pastdue: ['ਭੋਗ ਹੋ ਗਿਆ, ਬਕਾਇਆ ਬਾਕੀ', 'Bhog done, balance pending'],
    noshow: ['ਹਾਜ਼ਰ ਨਹੀਂ ਹੋਏ', 'No-show, closed'],
    cancelled: ['ਰੱਦ', 'Cancelled'],
    free: ['ਭੇਟਾ ਤੈਅ ਨਹੀਂ', 'No bheta set']
  };
  const chip = st => { const k = STATES[st] ? st : 'due'; return `<span class="bh ${k}"><span class="dot"></span><b>${STATES[k][0]}</b> · ${STATES[k][1]}</span>`; };
  // Indian financial year, e.g. 2026-27, for receipt numbers.
  const finYear = d => { d = d || new Date(); const y = d.getFullYear(), s = d.getMonth() >= 3 ? y : y - 1; return s + '-' + String((s + 1) % 100).padStart(2, '0'); };
  // Amount in words (Indian system) for receipts.
  function inWords(n) {
    n = Math.round(Number(n) || 0); if (!n) return 'Zero';
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const two = x => x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : '');
    const three = x => (x >= 100 ? a[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' : '') : '') + (x % 100 ? two(x % 100) : '');
    const parts = []; const cr = Math.floor(n / 1e7); n %= 1e7; const lk = Math.floor(n / 1e5); n %= 1e5; const th = Math.floor(n / 1e3); n %= 1e3;
    if (cr) parts.push(three(cr) + ' Crore'); if (lk) parts.push(two(lk) + ' Lakh'); if (th) parts.push(two(th) + ' Thousand'); if (n) parts.push(three(n));
    return parts.join(' ');
  }

  return { ADVANCE_PCT, discountOf, money, advanceOf, bhogDate, account, STATES, chip, finYear, inWords,
    CHANGE_HOURS, CUTOFF_TEXT, bookedMs, changeDeadline, canReschedule, fmtTime, phoneKey, waLink, feeOf, upiLink, confirmText,
    pad, iso, parse, add, fmtShort, fmtLong, fmtDow, TYPES, OCCASIONS, today, first, last, esc, typeOf, slotId, makeRef,
    MAX_PLACES, capOf, freeSeats, isFree, bookingsOn };
})();
