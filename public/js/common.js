// Shared settings: path types, timings, occasions and date helpers.
// To change timings or add a path, edit TYPES below (and the type list in firestore.rules).
window.GPB = (function () {
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const add = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  // Punjabi dates, spelled out here so every phone shows them the same way.
  const MONTHS = ['ਜਨਵਰੀ', 'ਫ਼ਰਵਰੀ', 'ਮਾਰਚ', 'ਅਪ੍ਰੈਲ', 'ਮਈ', 'ਜੂਨ', 'ਜੁਲਾਈ', 'ਅਗਸਤ', 'ਸਤੰਬਰ', 'ਅਕਤੂਬਰ', 'ਨਵੰਬਰ', 'ਦਸੰਬਰ'];
  const DAYS = ['ਐਤਵਾਰ', 'ਸੋਮਵਾਰ', 'ਮੰਗਲਵਾਰ', 'ਬੁੱਧਵਾਰ', 'ਵੀਰਵਾਰ', 'ਸ਼ੁੱਕਰਵਾਰ', 'ਸ਼ਨੀਵਾਰ'];
  const DAYS_S = ['ਐਤ', 'ਸੋਮ', 'ਮੰਗਲ', 'ਬੁੱਧ', 'ਵੀਰ', 'ਸ਼ੁੱਕਰ', 'ਸ਼ਨੀ'];
  const monthYear = d => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const clock = d => { const h = d.getHours(), m = String(d.getMinutes()).padStart(2, '0');
    const part = h < 12 ? 'ਸਵੇਰੇ' : h < 16 ? 'ਦੁਪਹਿਰ' : h < 20 ? 'ਸ਼ਾਮ' : 'ਰਾਤ'; return `${part} ${(h % 12) || 12}:${m}`; };
  const fmtDateTime = x => { const d = new Date(x); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${clock(d)}`; };
  const fmtShort = s => { const d = parse(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
  const fmtLong = s => { const d = parse(s); return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
  const fmtDow = s => DAYS_S[parse(s).getDay()];

  // Paths booked online. Sukhmani Sahib is now arranged directly with the Granthi Singhs (see INFO below);
  // its old keys stay in ALL_TYPES so earlier bookings still show their names.
  const ALL_TYPES = [
    { key: 'akhand', pa: 'ਅਖੰਡ ਪਾਠ ਸਾਹਿਬ', en: 'Akhand Path Sahib', days: 2,
      when: d => `ਆਰੰਭ ${fmtShort(d)} ਸਵੇਰੇ · ਭੋਗ ${fmtShort(add(d, 2))} ਸਵੇਰੇ` },
    { key: 'sehaj', pa: 'ਸਹਿਜ ਪਾਠ ਦਾ ਭੋਗ', en: 'Sehaj Path · Bhog', days: 1, when: () => 'ਭੋਗ ਸਵੇਰ ਦੇ ਦੀਵਾਨ ਵਿੱਚ' },
    { key: 'sukh-am', pa: 'ਸੁਖਮਨੀ ਸਾਹਿਬ', en: 'Sukhmani Sahib · Morning', days: 1, when: () => 'ਸਵੇਰੇ 7:00 ਵਜੇ' },
    { key: 'sukh-pm', pa: 'ਸੁਖਮਨੀ ਸਾਹਿਬ', en: 'Sukhmani Sahib · Evening', days: 1, when: () => 'ਸ਼ਾਮ 5:00 ਵਜੇ' }
  ];
  const TYPES = ALL_TYPES.filter(t => !t.key.startsWith('sukh'));
  // Information for the sangat (the committee can rewrite each part on the committee page).
  const INFO_DEFAULTS = {
    includes: ["ਗ੍ਰੰਥੀ ਸਿੰਘ ਜੀ ਦੀ ਭੇਟਾ / Granthi Singh ji's bheta", "ਕੜਾਹ ਪ੍ਰਸ਼ਾਦ / Karah Parshad", "ਰੁਮਾਲਾ ਸਾਹਿਬ / Rumala Sahib", "20–25 ਸੰਗਤ ਲਈ ਲੰਗਰ ਪ੍ਰਸ਼ਾਦਾ / Langar parshada for 20–25 sangat"],
    bigEvent: "ਜੇ ਆਪ ਜੀ ਦਾ ਸਮਾਗਮ ਵੱਡਾ ਹੈ (ਜ਼ਿਆਦਾ ਸੰਗਤ), ਤਾਂ ਵਾਧੂ ਲੰਗਰ ਜਾਂ ਹੋਰ ਪ੍ਰਬੰਧ ਆਪ ਜੀ ਆਪਣੇ ਵੱਲੋਂ ਕਰ ਸਕਦੇ ਹੋ ਜੀ; ਗੁਰੂ ਘਰ ਵੱਲੋਂ ਇਸ ਲਈ ਥਾਂ ਖੁਸ਼ੀ ਨਾਲ ਦਿੱਤੀ ਜਾਵੇਗੀ। ਹੋਰ ਪ੍ਰਬੰਧਾਂ ਲਈ ਕਿਰਪਾ ਕਰਕੇ ਗੁਰਦੁਆਰਾ ਦਫ਼ਤਰ ਨਾਲ ਸਿੱਧਾ ਸੰਪਰਕ ਕਰੋ ਜੀ। ਇਨ੍ਹਾਂ ਪ੍ਰਬੰਧਾਂ ਦੀ ਭੇਟਾ ਬੁਕਿੰਗ ਦੇ ਭੇਟਾ ਵਾਲੇ ਹਿੱਸੇ ਵਿੱਚ \"ਸੇਵਾ ਭੇਟਾ\" ਵਜੋਂ ਆਨਲਾਈਨ ਵੀ ਭੇਜੀ ਜਾ ਸਕਦੀ ਹੈ ਜੀ।\nFor a bigger programme (more sangat), you may arrange extra langar or other arrangements yourselves; Gurughar will gladly provide the venue. For further arrangements, kindly contact the gurdwara office directly. The bheta for these can also be sent online as \"Seva bheta\" in the bheta section of your booking.",
    sukhmaniNote: "ਸ੍ਰੀ ਸੁਖਮਨੀ ਸਾਹਿਬ ਦਾ ਪਾਠ ਗੁਰੂ ਘਰ ਦੇ ਗ੍ਰੰਥੀ ਸਿੰਘ ਸਾਹਿਬਾਨ ਆਪ ਜੀ ਦੇ ਘਰ ਆ ਕੇ ਕਰਦੇ ਹਨ। ਮਿਤੀ, ਸਮਾਂ ਅਤੇ ਭੇਟਾ ਕਿਰਪਾ ਕਰਕੇ ਗ੍ਰੰਥੀ ਸਿੰਘ ਜੀ ਨਾਲ ਸਿੱਧੀ ਤੈਅ ਕਰੋ ਜੀ। ਮਹਾਰਾਜ ਜੀ ਦੀ ਚੜ੍ਹਤ ਗੁਰਦੁਆਰਾ ਸਾਹਿਬ ਵਿਖੇ ਗੁਰੂ ਕੀ ਗੋਲਕ ਵਿੱਚ ਜਮ੍ਹਾਂ ਕਰਾਈ ਜਾਵੇ ਜੀ।\nSukhmani Sahib is performed at your home by the Gurughar's Granthi Singhs. Kindly fix the date, time and bheta directly with the Granthi Singh ji. The charhat offered to Maharaj is to be deposited in the Guru ki Golak at Gurdwara Sahib."
  };
  const infoOf = s => ({
    includes: (s && Array.isArray(s.includes) && s.includes.length) ? s.includes : INFO_DEFAULTS.includes,
    bigEvent: String((s && s.bigEvent) || '').trim() || INFO_DEFAULTS.bigEvent,
    sukhmaniNote: String((s && s.sukhmaniNote) || '').trim() || INFO_DEFAULTS.sukhmaniNote,
    granthis: (s && Array.isArray(s.granthis)) ? s.granthis : []
  });
  const OCCASIONS = ['ਜਨਮ ਦਿਨ', 'ਵਿਆਹ ਦੀ ਵਰ੍ਹੇਗੰਢ', 'ਗ੍ਰਹਿ ਪ੍ਰਵੇਸ਼ (ਨਵਾਂ ਘਰ)', 'ਬਰਸੀ', 'ਬੱਚੇ ਦਾ ਨਾਮਕਰਨ',
    'ਸ਼ੁਕਰਾਨਾ', 'ਨਵਾਂ ਕਾਰੋਬਾਰ', 'ਹੋਰ'];

  const today = iso(new Date());
  const first = add(today, 1);               // bookings open from tomorrow
  const last = (() => { const d = new Date(); d.setMonth(d.getMonth() + 6); return iso(d); })(); // six months ahead

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const typeOf = k => ALL_TYPES.find(t => t.key === k);
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
  // Minimum days ahead a path can be booked (committee setting). Leaves time for the 48-hour advance
  // and date-change window to close before the path starts. Also enforced in firestore.rules.
  const LEAD_DEFAULTS = { akhand: 7, sehaj: 3 };
  const leadDays = (settings, key) => { const n = Number(settings && settings.leadDays && settings.leadDays[key]);
    return Number.isFinite(n) && n >= 1 && n <= 90 ? Math.round(n) : (LEAD_DEFAULTS[key] || 3); };
  const firstFor = (settings, key) => { const f = add(today, leadDays(settings, key)); return f > first ? f : first; };
  function freeSeats(t, date, slots, settings) {
    const closed = (settings && settings.closed) || [];
    if (date < firstFor(settings, t.key) || date > last) return [];
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

  // Online date changes are allowed within 48 hours of making the booking (enforced in firestore.rules too).
  const CHANGE_HOURS = 48;   // also in firestore.rules
  const CUTOFF_TEXT = 'within 48 hours of booking';
  const bookedMs = v => { const b = v && v.bookedAt; if (!b) return 0;
    if (typeof b === 'string') return Date.parse(b);
    if (b.toMillis) return b.toMillis();
    return (b.seconds || 0) * 1000; };
  const changeDeadline = v => bookedMs(v) + CHANGE_HOURS * 3600e3;
  const canReschedule = v => bookedMs(v) > 0 && Date.now() < changeDeadline(v) && v.start > iso(new Date());
  const fmtTime = ms => { const d = new Date(ms); return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${clock(d)}`; };
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
    const t = typeOf(o.type) || { en: o.type, pa: o.type };
    return `ਵਾਹਿਗੁਰੂ ਜੀ ਕਾ ਖ਼ਾਲਸਾ, ਵਾਹਿਗੁਰੂ ਜੀ ਕੀ ਫ਼ਤਹਿ।\n` +
      `${o.moved ? 'ਆਪ ਜੀ ਦੀ ਬੁਕਿੰਗ ਦੀ ਮਿਤੀ ਬਦਲ ਗਈ ਹੈ' : 'ਆਪ ਜੀ ਦੀ ਬੁਕਿੰਗ ਪੱਕੀ ਹੋ ਗਈ ਹੈ'}।\n` +
      `ਪਾਠ: ${t.pa} (${t.en})\nਸਥਾਨ: ${o.gname}\nਮਿਤੀ: ${fmtLong(o.date)}${t.days > 1 ? `\nਭੋਗ: ${fmtLong(add(o.date, 2))}` : ''}\n` +
      `ਪਰਿਵਾਰ: ${o.name} ਪਰਿਵਾਰ\nਬੁਕਿੰਗ ਨੰਬਰ: ${o.ref}\n` +
      (o.deadline && o.deadline > Date.now() ? `ਮਿਤੀ ਬਦਲਣ ਲਈ (${fmtTime(o.deadline)} ਤੱਕ): ${o.url} → "ਮੇਰੀ ਬੁਕਿੰਗ"` : `ਬੁਕਿੰਗ: ${o.url}`) +
      (o.phone ? `\nਗੁਰਦੁਆਰਾ ਦਫ਼ਤਰ: ${o.phone}` : '') + `\nਧੰਨਵਾਦ ਜੀ।`;
  }



  // ---------- Bheta accounts ----------
  // Each booking keeps: total (bheta for that path), discount (₹ off when the whole amount is paid
  // online, worked out at booking as a % of the bheta), paidOnline and paidCash (only amounts the committee has confirmed), and receipts.
  const ADVANCE_PCT = 20;   // advance needed within the hold time to keep a booking (also in firestore.rules)
  // % off when the whole bheta is paid online (committee setting, default 10; also in firestore.rules).
  const discountPct = settings => { const n = Number(settings && settings.onlineDiscountPct);
    return Number.isFinite(n) && n >= 0 && n <= 50 ? Math.round(n) : 10; };
  // Hours an unpaid booking is held before the date is released (committee setting; 0 = never).
  const holdHours = settings => { const n = Number(settings && settings.holdHours);
    return Number.isFinite(n) && n >= 0 && n <= 168 ? Math.round(n) : 48; };
  // Refund / date-change policy shown to the sangat (committee can rewrite it).
  const DEFAULT_POLICY = 'ਸਤਿਕਾਰਯੋਗ ਸੰਗਤ ਜੀ, ਬੁਕਿੰਗ ਪੱਕੀ ਰੱਖਣ ਲਈ 48 ਘੰਟਿਆਂ ਦੇ ਅੰਦਰ ਘੱਟੋ-ਘੱਟ 20% ਅਗਾਊਂ ਭੇਟਾ (ਆਨਲਾਈਨ ਜਾਂ ਗੁਰਦੁਆਰੇ) ਜ਼ਰੂਰੀ ਹੈ ਜੀ; ਨਹੀਂ ਤਾਂ ਬੁਕਿੰਗ ਆਪਣੇ ਆਪ ਰੱਦ ਹੋ ਜਾਂਦੀ ਹੈ ਅਤੇ ਦੁਬਾਰਾ ਬੁਕਿੰਗ ਕਰਨੀ ਪਵੇਗੀ। ਪਾਠ ਲਈ ਭੇਟ ਕੀਤੀ ਭੇਟਾ ਵਾਪਸ ਨਹੀਂ ਕੀਤੀ ਜਾਂਦੀ। ਜੇ ਆਪ ਜੀ ਨੂੰ ਮਿਤੀ ਬਦਲਣੀ ਪਵੇ, ਤਾਂ ਬੁਕਿੰਗ ਤੋਂ 48 ਘੰਟਿਆਂ ਦੇ ਅੰਦਰ "ਮੇਰੀ ਬੁਕਿੰਗ" ਵਿੱਚ ਆਪ ਬਦਲ ਸਕਦੇ ਹੋ ਜੀ। ਉਸ ਤੋਂ ਬਾਅਦ ਕਿਰਪਾ ਕਰਕੇ ਗੁਰਦੁਆਰਾ ਦਫ਼ਤਰ ਨਾਲ ਸੰਪਰਕ ਕਰੋ ਜੀ; ਆਪ ਜੀ ਦੀ ਭੇਟਾ ਨਵੀਂ ਮਿਤੀ ਲਈ ਮੰਨੀ ਜਾਵੇਗੀ।' + '\n' + 'Respected sangat ji, to keep a booking, an advance of at least 20% (online or at the gurdwara) is required within 48 hours; otherwise the booking is cancelled automatically and you will need to book again. Bheta offered for a path is not refunded. If you need to change the date, you can do it yourself under "My booking" within 48 hours of booking. After that, kindly contact the gurdwara office ji; your bheta will be kept for the new date.';
  const policyOf = settings => String((settings && settings.policy) || '').trim() || DEFAULT_POLICY;
  const discountOf = (settings, total) => Math.round((Number(total) || 0) * discountPct(settings) / 100);
  const money = n => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
  const advanceOf = total => Math.ceil(total * ADVANCE_PCT / 100);
  const bhogDate = (type, start) => { const t = typeOf(type); return t && t.days > 1 ? add(start, 2) : start; };
  // Seva bheta: an optional gift to Gurdwara Sahib, kept apart from the path bheta.
  const SEVA_PICKS = [101, 251, 501, 1100];
  // Seva bheta gets its own receipts (own number series), listed in l.sevaReceipts.
  // Number part of a receipt like GBJS/2026-27/0042 -> 42.
  const receiptSerial = no => { const m = String(no || '').match(/(\d+)\s*$/); return m ? parseInt(m[1], 10) : 0; };
  const sevaOf = l => ((l && l.sevaReceipts) || []).reduce((s, r) => s + (r.void ? 0 : Number(r.amount) || 0), 0);
  // A booking that has any money record (receipts, refunds or a payment being checked) is kept when cancelled.
  const hasMoney = l => !!(l && ((l.receipts || []).length || (l.sevaReceipts || []).length || (l.refunds || []).length || l.checking));
  const VOID_REASONS = ['Entered by mistake', 'Wrong amount', 'Payment not received in bank', 'Duplicate receipt', 'Wrong family or booking', 'Other'];
  const CANCEL_REASONS = ['Devotee asked to cancel', 'No advance received', 'Date not available (gurdwara programme)', 'Duplicate booking', 'Other'];
  const REFUND_REASONS = ['Booking cancelled', 'Paid twice', 'Paid too much', 'Gurdwara cancelled the programme', 'Other'];
  function account(l) {
    l = l || {};
    const total = Number(l.total) || 0, disc = Number(l.discount) || 0;
    const online = Number(l.paidOnline) || 0, cash = Number(l.paidCash) || 0, refunded = Number(l.refunded) || 0;
    const paid = Math.max(0, online + cash - refunded);   // voided receipts are already taken off online/cash
    const fullOnline = Math.max(0, total - disc);
    const target = cash > 0 ? total : fullOnline;          // discount only when nothing is paid in cash
    const due = Math.max(0, target - paid);
    const advance = advanceOf(total);
    const advanceDue = Math.max(0, advance - online);
    let state;
    if (l.closed === 'noshow') state = 'noshow';
    else if (l.closed === 'cancelled') state = 'cancelled';
    else if (l.closed === 'expired') state = 'expired';
    else if (!total) state = 'free';
    else if (!due) state = 'paid';
    else if (l.checking) state = 'checking';
    else if (!paid) state = 'due';
    else state = 'partial';
    return { total, disc, online, cash, refunded, paid, fullOnline, target, due, advance, advanceDue, state };
  }
  const STATES = {
    due: ['ਅਗਾਊਂ ਭੇਟਾ ਬਾਕੀ', 'Advance due'],
    checking: ['ਜਾਂਚ ਅਧੀਨ', 'Payment being checked'],
    partial: ['ਅੰਸ਼ਕ ਭੇਟਾ ਪ੍ਰਾਪਤ', 'Part paid, balance due'],
    paid: ['ਪੂਰੀ ਭੇਟਾ ਪ੍ਰਾਪਤ', 'Fully paid'],
    expired: ['ਅਗਾਊਂ ਭੇਟਾ ਨਾ ਆਉਣ ਕਰਕੇ ਬੁਕਿੰਗ ਰੱਦ', 'Cancelled, advance not paid'],
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

  return { SEVA_PICKS, receiptSerial, sevaOf, hasMoney, VOID_REASONS, CANCEL_REASONS, REFUND_REASONS, INFO_DEFAULTS, infoOf, ALL_TYPES, ADVANCE_PCT, discountPct, discountOf, holdHours, policyOf, DEFAULT_POLICY, money, advanceOf, bhogDate, account, STATES, chip, finYear, inWords,
    CHANGE_HOURS, CUTOFF_TEXT, bookedMs, changeDeadline, canReschedule, fmtTime, phoneKey, waLink, feeOf, upiLink, confirmText,
    MONTHS, monthYear, fmtDateTime, pad, iso, parse, add, fmtShort, fmtLong, fmtDow, TYPES, OCCASIONS, today, first, last, esc, typeOf, slotId, makeRef,
    MAX_PLACES, capOf, freeSeats, isFree, bookingsOn, LEAD_DEFAULTS, leadDays, firstFor };
})();
