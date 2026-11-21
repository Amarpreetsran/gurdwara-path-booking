// Data layer. Uses Firebase when firebase-config.js is filled in,
// otherwise a demo store kept in this browser only.
//
// Collections:
//   slots/{date__path__place}  public calendar entries (family name, occasion)
//   contacts/{startSlotId}     phone + note (committee only)
//   lookup/{ref}               the booking's account: total, discount, amounts paid, receipts, status
//                              (readable by anyone who knows the reference, not listable)
//   reports/{ref_n}            a devotee's "I have paid" UPI report (committee only)
//   reschedules/{old_ref}      record of a date change by the devotee
//   counters/receipts          receipt numbering (committee only)
//   settings/main              gurdwara details, places, fees, UPI
window.GPB_API = (function () {
  const G = window.GPB;
  const cfg = window.FIREBASE_CONFIG || {};
  const DEMO = !cfg.apiKey || cfg.apiKey.indexOf('PASTE') === 0 || location.protocol === 'file:';

  function cleanSettings(v) {
    v = v || {};
    const capacity = {}, fees = {};
    G.TYPES.forEach(t => { capacity[t.key] = G.capOf(v, t.key); fees[t.key] = G.feeOf(v, t.key); });
    return { name: v.name || 'Gurdwara Sahib', phone: v.phone || '', address: v.address || '',
      closed: Array.isArray(v.closed) ? v.closed : [], capacity,
      upi: String(v.upi || '').trim(), payee: String(v.payee || '').trim(), fees,
      onlineDiscountPct: G.discountPct(v), holdHours: G.holdHours(v),
      policy: String(v.policy || '').trim().slice(0, 1500), receiptPrefix: String(v.receiptPrefix || 'RCPT').trim() || 'RCPT',
      sevaPrefix: String(v.sevaPrefix || 'SEVA').trim() || 'SEVA',
      refundPrefix: String(v.refundPrefix || 'REFUND').trim() || 'REFUND',
      expensePrefix: String(v.expensePrefix || 'EXP').trim() || 'EXP',
      includes: Array.isArray(v.includes) ? v.includes.map(x => String(x).trim().slice(0, 120)).filter(Boolean).slice(0, 12) : [],
      leadDays: Object.fromEntries(G.TYPES.map(t => [t.key, G.leadDays(v, t.key)])),
      bigEvent: String(v.bigEvent || '').trim().slice(0, 1500),
      sukhmaniNote: String(v.sukhmaniNote || '').trim().slice(0, 1500),
      granthis: Array.isArray(v.granthis) ? v.granthis.slice(0, 20).map(g => ({ name: String(g.name || '').trim().slice(0, 60),
        phone: String(g.phone || '').trim().slice(0, 20), note: String(g.note || '').trim().slice(0, 80) })).filter(g => g.name && g.phone) : [],
      // Pathi Singh rosters and bheta
      raulHours: G.raulHoursOf(v), akhandTime: G.akhandTimeOf(v),
      raulBheta: Math.max(0, Math.round(Number(v.raulBheta) || 0)), sehajBheta: Math.max(0, Math.round(Number(v.sehajBheta) || 0)),
      // Programmes and gurpurabs on the booking page
      programmes: Array.isArray(v.programmes) ? v.programmes.slice(0, 40).map(x => ({ id: String(x.id || '').slice(0, 20), date: String(x.date || '').slice(0, 10),
        title: String(x.title || '').trim().slice(0, 120), note: String(x.note || '').trim().slice(0, 600),
        sevas: Array.isArray(x.sevas) ? x.sevas.map(y => String(y).trim().slice(0, 60)).filter(Boolean).slice(0, 10) : [] }))
        .filter(x => x.id && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && x.title) : [] };
  }

  function buildDocs(t, date, info, ref, seat, bookedAt) {
    const ids = [];
    for (let i = 0; i < t.days; i++) ids.push(G.slotId(G.add(date, i), t.key, seat));
    const docs = ids.map((id, i) => {
      const d = { type: t.key, date: G.add(date, i), start: date, part: i, seat, name: info.name, occasion: info.occasion, bookedAt };
      if (t.days > 1 && i === 0) d.next = ids[1];
      return [id, d];
    });
    const contact = { phone: info.phone, note: info.note || '', name: info.name, ref, pkey: G.phoneKey(info.phone) };
    return { ids, docs, contact };
  }
  // The booking's account record, fixed at the moment of booking.
  function newLookup(t, date, name, slot, settings) {
    const total = G.feeOf(settings, t.key);
    return { slot, type: t.key, name, start: date, total, discount: G.discountOf(settings, total),
      paidOnline: 0, paidCash: 0, receipts: [], reports: 0, checking: false, closed: '' };
  }
  const idsOf = v => { const t = G.typeOf(v.type); const out = [];
    for (let i = 0; i < (t ? t.days : 1); i++) out.push(G.slotId(G.add(v.start, i), v.type, v.seat || 1)); return out; };
  const receiptNo = (prefix, fy, n) => `${prefix}/${fy}/${String(n).padStart(4, '0')}`;
  const pastFrom = () => G.add(G.today, -120);
  // Who is signed in on the committee page (for "issued by" and the activity log).
  let me = null;
  const who = () => (me && (me.name || me.email)) || '';
  const randomId = n => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', a = new Uint32Array(n); crypto.getRandomValues(a); return [...a].map(x => c[x % c.length]).join(''); };
  const newPin = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return String(1000 + (a[0] % 9000)); };
  async function sha256(t) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
  const pinHash = (id, pin) => sha256(id + ':' + pin);
  const cleanRoster = o => ({ ref: o.ref, type: o.type, start: o.start, name: String(o.name || '').slice(0, 150), place: String(o.place || '').trim().slice(0, 150),
    time: String(o.time || ''), hours: Number(o.hours) || 0, note: String(o.note || '').trim().slice(0, 300),
    rauls: (o.rauls || []).slice(0, 60).map(x => ({ from: x.from || '', to: x.to || '', pathiId: x.pathiId || '', name: String(x.name || '').slice(0, 80), label: String(x.label || '').slice(0, 40) })),
    pathiIds: [...new Set((o.rauls || []).map(x => x.pathiId).filter(Boolean))] });
  // What each committee action writes to the activity log: [action, booking ref, detail].
  const R$ = n => '₹' + (Number(n) || 0);
  const LOGS = {
    book: (a, r) => a[3] && a[3].office ? ['Office booking', r, `${a[0].en} ${a[1]} · ${a[2].name}`] : null,
    verifyReport: (a, r) => ['Online payment confirmed', String(a[0]).replace(/_\d+$/, ''), [r && r.no, r && r.sevaNo].filter(Boolean).join(', ')],
    rejectReport: a => ['Payment marked not received', String(a[0]).replace(/_\d+$/, ''), a[0]],
    recordCash: (a, r) => ['Payment at gurdwara', a[0], `${R$(a[1])}${a[3] ? ' + seva ' + R$(a[3]) : ''} ${a[2]} · ${[r && r.no, r && r.sevaNo].filter(Boolean).join(', ')}`],
    voidReceipt: a => ['Receipt made void', a[0], `${a[1]} receipt ${a[2] + 1} · ${a[3]}${a[4] ? ' · ' + a[4] : ''}`],
    refund: (a, r) => ['Refund', a[0], `${R$(a[1])} ${a[2]} · ${a[3]} · ${r}`],
    cancel: (a, r) => ['Booking cancelled', r, a[1]],
    setClosed: a => [a[1] ? 'Closed as ' + a[1] : 'Reopened', a[0], ''],
    deleteEntry: a => ['Entry deleted (no payment)', a[0], ''],
    verifySevaOnly: (a, r) => ['Online seva confirmed', a[0], r],
    rejectSevaOnly: a => ['Seva marked not received', a[0], ''],
    recordSevaAtOffice: (a, r) => ['Seva at gurdwara', r, `${R$(a[0].amount)} ${a[0].method} · ${a[0].name}`],
    voidSevaOnly: a => ['Seva receipt made void', a[0], a[1]],
    addExpense: (a, r) => ['Payment voucher', a[0].ref || '', `${R$(a[0].amount)} ${a[0].method} · ${a[0].category} · ${a[0].name}`],
    voidExpense: a => ['Payment voucher made void', '', `${a[1]}${a[2] ? ' · ' + a[2] : ''}`],
    setNextReceipt: a => ['Receipt number set', '', `${a[0]}: next ${a[1]}`],
    saveSettings: () => ['Settings saved', '', ''],
    invite: a => ['User invited', '', `${a[0]} · ${a[2]}`],
    cancelInvite: a => ['Invite removed', '', a[0]],
    setStaff: a => ['User changed', '', `${a[2] || a[0]}: ${Object.entries(a[1]).map(([k, v]) => k + ' ' + v).join(', ')}`],
    addPathi: a => ['Pathi Singh added', '', a[0].name],
    updatePathi: a => ['Pathi Singh changed', '', a[1].name || a[0]],
    resetPin: a => ['Pathi Singh PIN reset', '', a[1] || a[0]],
    saveRoster: a => ['Roster saved', a[0].ref, `${(a[0].rauls || []).filter(x => x.pathiId).length} of ${(a[0].rauls || []).length} filled`],
    deleteSignup: a => ['Seva sign-up removed', '', a[1] || a[0]]
  };
  function withLog(api, write) {
    for (const k of Object.keys(LOGS)) if (api[k]) { const f = api[k];
      api[k] = async (...a) => { const r = await f.apply(api, a);
        try { const x = me && LOGS[k](a, r); if (x) write({ action: x[0], ref: x[1] || '', detail: String(x[2] || '').slice(0, 300) }); } catch (e) { console.error('Log', e); }
        return r; }; }
    return api;
  }

  // ---------- Demo store ----------
  if (DEMO) {
    const KEY = 'gpb-demo-v3';
    const load = () => { let m; try { m = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { m = {}; }
      ['slots', 'contacts', 'lookup', 'reports', 'counters', 'sevaonly', 'sevacontacts', 'expenses', 'rosters', 'pathis', 'pathipins', 'notices', 'signups', 'log', 'staff', 'invites'].forEach(k => { m[k] = m[k] || {}; });
      m.settings = cleanSettings(m.settings); return m; };
    let mem = load();
    const subs = { slots: [], settings: [], auth: [], admin: [], lookup: [], seva: [], staff: [], log: [] };
    // Demo sign-in: password "demo" = Pardhan/Admin, "treasurer" = Khazanchi, "sevadar" = Sevadar.
    let demoUser = null;
    try { const r = sessionStorage.getItem('gpb-demo-admin'); if (r) demoUser = { email: 'demo-' + (r === '1' ? 'admin' : r) + '@committee', role: r === '1' ? 'admin' : r }; } catch (e) {}
    if (demoUser) me = { uid: 'demo', email: demoUser.email, name: demoUser.email.split('@')[0], role: demoUser.role };
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) {} };
    const clone = o => JSON.parse(JSON.stringify(o));
    const emit = () => {
      const s = {}; for (const [k, v] of Object.entries(mem.slots)) if (v.date >= G.today) s[k] = v;
      subs.slots.forEach(f => f(s, false)); subs.settings.forEach(f => f(mem.settings));
      const all = {}; for (const [k, v] of Object.entries(mem.slots)) if (v.date >= pastFrom()) all[k] = v;
      const failed = Object.fromEntries(Object.entries(mem.notices).filter(([, n]) => n.status === 'failed'));
      subs.admin.forEach(f => f(clone({ slots: all, contacts: mem.contacts, lookups: mem.lookup, reports: mem.reports, counters: mem.counters, sevaonly: mem.sevaonly, sevacontacts: mem.sevacontacts,
        expenses: me && G.roleAtLeast(me.role, 'treasurer') ? mem.expenses : {}, rosters: mem.rosters, pathis: mem.pathis, notices: failed, signups: mem.signups })));
      subs.staff.forEach(f => f(clone({ staff: mem.staff, invites: mem.invites })));
      subs.log.forEach(f => f(clone(Object.entries(mem.log).sort((a, b) => a[1].at < b[1].at ? 1 : -1).slice(0, 300))));
      subs.seva.forEach(([r, f]) => f(mem.sevaonly[r] ? clone(mem.sevaonly[r]) : null));
      subs.lookup.forEach(([ref, f]) => f(mem.lookup[ref] ? clone(mem.lookup[ref]) : null));
    };
    const change = () => { save(); emit(); };
    window.addEventListener('storage', e => { if (e.key === KEY) { mem = load(); emit(); } });
    // Path bheta and seva bheta each get their own receipt from their own number series.
    const takeNo = (key, prefix) => { const fy = G.finYear(), c = mem.counters[key] && mem.counters[key].fy === fy ? mem.counters[key] : { fy, next: 1 };
      mem.counters[key] = { fy, next: c.next + 1 }; return receiptNo(prefix || (key === 'seva' ? 'SEVA' : 'RCPT'), fy, c.next); };
    const issue = (ref, amount, method, utr, seva) => {
      const fy = G.finYear(), l = mem.lookup[ref], date = new Date().toISOString(), out = { no: '', sevaNo: '' };
      const take = (key, prefix) => { const c = mem.counters[key] && mem.counters[key].fy === fy ? mem.counters[key] : { fy, next: 1 };
        mem.counters[key] = { fy, next: c.next + 1 }; return receiptNo(prefix, fy, c.next); };
      if (amount > 0) { out.no = take('receipts', mem.settings.receiptPrefix); l.receipts = [...(l.receipts || []), { no: out.no, amount, method, utr: utr || '', date, by: who() }]; }
      if (seva > 0) { out.sevaNo = take('seva', mem.settings.sevaPrefix); l.sevaReceipts = [...(l.sevaReceipts || []), { no: out.sevaNo, amount: seva, method, utr: utr || '', date, by: who() }]; }
      return out;
    };
    const demoApi = {
      demo: true,
      notify() {},
      me: () => me,
      async callFn(name, body) { console.log('demo function', name, body); return { ok: true, demo: true, results: [] }; },
      watchSlots(cb) { subs.slots.push(cb); setTimeout(emit, 50); },
      watchSettings(cb) { subs.settings.push(cb); setTimeout(() => cb(mem.settings), 50); },
      watchLookup(ref, cb) { subs.lookup.push([ref, cb]); setTimeout(emit, 50); },
      async book(t, date, info, opts) {
        const seats = G.freeSeats(t, date, mem.slots, mem.settings, opts);
        if (!seats.length) throw new Error('taken');
        const ref = G.makeRef();
        const { ids, docs, contact } = buildDocs(t, date, info, ref, seats[0], new Date().toISOString());
        docs.forEach(([id, d]) => { mem.slots[id] = { ...d, createdAt: new Date().toISOString() }; });
        mem.contacts[ids[0]] = { ...contact, createdAt: new Date().toISOString() };
        mem.lookup[ref] = newLookup(t, date, info.name, ids[0], mem.settings);
        change(); return ref;
      },
      async findBooking(ref) {
        const l = mem.lookup[ref]; if (!l) return null;
        const v = mem.slots[l.slot];
        return { id: l.slot, ref, data: v ? clone(v) : null, l: clone(l) };
      },
      async reschedule(b, phone, date) {
        const t = G.typeOf(b.data.type);
        if (!G.canReschedule(b.data)) throw new Error('late');
        const c = mem.contacts[b.id];
        if (!c || c.pkey !== G.phoneKey(phone)) throw new Error('nomatch');
        const old = idsOf(b.data);
        const others = Object.fromEntries(Object.entries(mem.slots).filter(([k]) => !old.includes(k)));
        const seats = G.freeSeats(t, date, others, mem.settings);
        if (!seats.length) throw new Error('taken');
        old.forEach(id => delete mem.slots[id]); delete mem.contacts[b.id];
        const { ids, docs, contact } = buildDocs(t, date, { name: b.data.name, occasion: b.data.occasion, phone: c.phone, note: c.note }, b.ref, seats[0], b.data.bookedAt);
        docs.forEach(([id, d]) => { mem.slots[id] = { ...d, createdAt: new Date().toISOString() }; });
        mem.contacts[ids[0]] = { ...contact, createdAt: new Date().toISOString() };
        Object.assign(mem.lookup[b.ref], { slot: ids[0], prev: b.id, start: date });
        change(); return b.ref;
      },
      async reportPayment(ref, utr, amount, seva) {
        seva = Math.max(0, Math.round(seva || 0));
        const l = mem.lookup[ref]; if (!l) throw new Error('missing');
        const a = G.account(l);
        if (!a.paid && !l.checking && amount < a.advance) throw new Error('advance');
        l.reports = (l.reports || 0) + 1; l.checking = true;
        mem.reports[ref + '_' + l.reports] = { ref, utr, amount, seva, createdAt: new Date().toISOString() };
        change();
      },
      // Committee
      watchAdmin(cb) { subs.admin.push(cb); setTimeout(emit, 50); },
      async verifyReport(id, stillChecking) {
        const r = mem.reports[id]; const l = mem.lookup[r.ref];
        const o = issue(r.ref, r.amount, 'UPI', r.utr, r.seva || 0);
        l.paidOnline = (l.paidOnline || 0) + r.amount; l.checking = !!stillChecking;
        Object.assign(r, { status: 'verified', receiptNo: o.no, sevaReceiptNo: o.sevaNo }); change(); return o;
      },
      async rejectReport(id, stillChecking) {
        const r = mem.reports[id]; r.status = 'rejected'; mem.lookup[r.ref].checking = !!stillChecking; change();
      },
      // Seva bheta without a path booking.
      async reportSevaOnly(o) {
        if (mem.sevaonly[o.ref]) throw new Error('exists');
        mem.sevaonly[o.ref] = { name: o.name, amount: o.amount, purpose: o.purpose, utr: o.utr, status: 'checking', createdAt: new Date().toISOString() };
        mem.sevacontacts[o.ref] = { phone: o.phone, pkey: G.phoneKey(o.phone), createdAt: new Date().toISOString() }; change();
      },
      watchSevaOnly(ref, cb) { subs.seva.push([ref, cb]); setTimeout(() => cb(mem.sevaonly[ref] ? clone(mem.sevaonly[ref]) : null), 50); },
      async getSevaOnly(ref) { return mem.sevaonly[ref] ? clone(mem.sevaonly[ref]) : null; },
      async verifySevaOnly(ref) {
        const d = mem.sevaonly[ref]; if (!d || d.status !== 'checking') return;
        const no = takeNo('seva', mem.settings.sevaPrefix);
        Object.assign(d, { status: 'verified', receipt: { no, amount: d.amount, method: 'UPI', utr: d.utr, date: new Date().toISOString(), by: who() } }); change(); return no;
      },
      async rejectSevaOnly(ref) { const d = mem.sevaonly[ref]; if (d) { d.status = 'rejected'; change(); } },
      async recordSevaAtOffice(o) {
        const ref = G.makeSevaRef(), no = takeNo('seva', mem.settings.sevaPrefix), date = new Date().toISOString();
        mem.sevaonly[ref] = { name: o.name, amount: o.amount, purpose: o.purpose, note: o.note || '', status: 'verified', office: true, createdAt: date,
          receipt: { no, amount: o.amount, method: o.method, utr: '', date, by: who() } };
        if (o.phone) mem.sevacontacts[ref] = { phone: o.phone, pkey: G.phoneKey(o.phone), createdAt: date };
        change(); return ref;
      },
      async voidSevaOnly(ref, reason, note) { const d = mem.sevaonly[ref]; if (d && d.receipt && !d.receipt.void) { d.receipt.void = { reason, note: note || '', date: new Date().toISOString(), by: who() }; change(); } },
      async addExpense(o) {
        const id = 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date = new Date().toISOString();
        const no = takeNo('expense', mem.settings.expensePrefix || 'EXP');
        mem.expenses[id] = { ...o, no, date, createdAt: date, by: who() }; change(); return id;
      },
      async voidExpense(id, reason, note) { const e = mem.expenses[id]; if (e && !e.void) { e.void = { reason, note: note || '', date: new Date().toISOString(), by: who() }; change(); } },
      async getExpense(id) { return mem.expenses[id] ? clone(mem.expenses[id]) : null; },
      async setNextReceipt(key, next) { mem.counters[key] = { fy: G.finYear(), next }; change(); },
      async recordCash(ref, amount, method, seva) {
        const l = mem.lookup[ref]; const o = issue(ref, amount, method || 'Cash', '', seva || 0);
        l.paidCash = (l.paidCash || 0) + amount; change(); return o;
      },
      async setClosed(ref, closed) { mem.lookup[ref].closed = closed || ''; change(); },
      onAuth(cb) { subs.auth.push(cb); setTimeout(() => cb(demoUser, !!demoUser, demoUser && demoUser.role, {}), 50); },
      async signIn(email, pass) {
        const role = { demo: 'admin', treasurer: 'treasurer', sevadar: 'sevadar' }[pass];
        if (!role) throw new Error('wrong');
        demoUser = { email: email || 'demo@committee', role };
        me = { uid: 'demo-' + role, email: demoUser.email, name: demoUser.email.split('@')[0], role };
        try { sessionStorage.setItem('gpb-demo-admin', role === 'admin' ? '1' : role); } catch (e) {}
        subs.auth.forEach(f => f(demoUser, true, role, {}));
      },
      async signUp() { throw Object.assign(new Error('demo'), { code: 'demo' }); },
      async resendVerification() {},
      async signOut() { demoUser = null; me = null; try { sessionStorage.removeItem('gpb-demo-admin'); } catch (e) {} subs.auth.forEach(f => f(null, false, null, {})); },
      async getContact(id) { return mem.contacts[id] || null; },
      // Frees the dates. A booking with money received is kept as "cancelled" for the records.
      async cancel(startId, reason) {
        const v = mem.slots[startId]; if (!v) return;
        idsOf(v).forEach(id => delete mem.slots[id]);
        const c = mem.contacts[startId], l = c && c.ref && mem.lookup[c.ref];
        if (l) { const cid = 'cx_' + c.ref; mem.contacts[cid] = c;
          Object.assign(l, { closed: 'cancelled', cancelReason: reason || '', closedAt: new Date().toISOString(), slot: cid, cancelledSlot: startId, closedBy: who() }); }
        delete mem.contacts[startId];
        change(); return (c && c.ref) || '';
      },
      async voidReceipt(ref, kind, i, reason, note) {
        const l = mem.lookup[ref], r = ((kind === 'seva' ? l.sevaReceipts : l.receipts) || [])[i];
        if (!r || r.void) return;
        r.void = { reason, note: note || '', date: new Date().toISOString(), by: who() };
        if (kind !== 'seva') { if (r.method === 'UPI') l.paidOnline = Math.max(0, (l.paidOnline || 0) - r.amount); else l.paidCash = Math.max(0, (l.paidCash || 0) - r.amount); }
        change();
      },
      async refund(ref, amount, method, reason, note) {
        const fy = G.finYear(), c = mem.counters.refund && mem.counters.refund.fy === fy ? mem.counters.refund : { fy, next: 1 };
        mem.counters.refund = { fy, next: c.next + 1 };
        const no = receiptNo(mem.settings.refundPrefix || 'REFUND', fy, c.next), l = mem.lookup[ref];
        l.refunds = [...(l.refunds || []), { no, amount, method, reason, note: note || '', date: new Date().toISOString(), by: who() }];
        l.refunded = (l.refunded || 0) + amount; change(); return no;
      },
      async deleteEntry(ref) {
        const l = mem.lookup[ref]; if (!l || G.hasMoney(l)) throw new Error('has-money');
        const v = l.slot && mem.slots[l.slot]; if (v) idsOf(v).forEach(id => delete mem.slots[id]);
        if (l.slot) delete mem.contacts[l.slot];
        for (const [id, r] of Object.entries(mem.reports)) if (r.ref === ref) delete mem.reports[id];
        delete mem.lookup[ref]; change();
      },
      async saveSettings(s) { mem.settings = cleanSettings(s); change(); },
      async resetPassword() {},
      // Users and activity log (Pardhan)
      watchStaff(cb) { subs.staff.push(cb); setTimeout(emit, 50); },
      watchLog(cb) { subs.log.push(cb); setTimeout(emit, 50); },
      async invite(email, name, role) { mem.invites[email.toLowerCase()] = { name, role, createdAt: new Date().toISOString(), by: who() }; change(); },
      async cancelInvite(email) { delete mem.invites[email]; change(); },
      async setStaff(uid, data) { Object.assign(mem.staff[uid], data); change(); },
      // Pathi Singhs: a private link + 4-digit PIN each.
      async addPathi(o) { const id = randomId(20), pin = newPin();
        mem.pathis[id] = { name: o.name, phone: o.phone || '', note: o.note || '', active: true, unavailable: [], createdAt: new Date().toISOString() };
        mem.pathipins[id] = { hash: await pinHash(id, pin), fails: 0, lockUntil: 0 }; change(); return { id, pin }; },
      async updatePathi(id, data) { Object.assign(mem.pathis[id], data); change(); },
      async resetPin(id) { const pin = newPin(); mem.pathipins[id] = { hash: await pinHash(id, pin), fails: 0, lockUntil: 0 }; change(); return pin; },
      async saveRoster(o) { mem.rosters[o.ref] = { ...cleanRoster(o), updatedAt: new Date().toISOString(), by: who() }; change(); },
      // Pathi Singh's own page (in the real site this goes through the server, which checks the PIN).
      async pathiView(id, pin, action, extra) {
        const dates = Array.isArray(extra) ? extra : [], x = Array.isArray(extra) ? {} : (extra || {});
        const p = mem.pathis[id], k = mem.pathipins[id];
        if (!p || !k || !p.active) return { error: 'notfound' };
        if (k.lockUntil > Date.now()) return { error: 'locked' };
        if (k.hash !== await pinHash(id, pin)) { k.fails = (k.fails || 0) + 1; if (k.fails >= 5) { k.lockUntil = Date.now() + 15 * 60e3; k.fails = 0; } save(); return { error: 'pin' }; }
        k.fails = 0;
        if (action === 'unavailable') { p.unavailable = dates; change(); }
        const paths = Object.entries(mem.lookup).filter(([, l]) => !l.closed && (l.type === 'akhand' || l.type === 'sehaj') && l.start >= G.today && l.start <= G.add(G.today, 90))
          .map(([ref, l]) => ({ ref, type: l.type, start: l.start, name: l.name })).sort((a, b) => a.start < b.start ? -1 : 1);
        p.avail = Object.fromEntries(Object.entries(p.avail || {}).filter(([r]) => paths.some(q => q.ref === r)));
        if (action === 'avail') { if (x.value) p.avail[x.ref] = x.value; else delete p.avail[x.ref]; change(); }
        if (action === 'usual') { p.usual = String(x.text || '').trim().slice(0, 200); change(); }
        const rosters = Object.values(mem.rosters).filter(r => (r.pathiIds || []).includes(id) && r.start >= G.add(G.today, -60))
          .map(r => ({ ref: r.ref, type: r.type, start: r.start, name: r.name, place: r.place, note: r.note || '', rauls: r.rauls.map(x => ({ from: x.from, to: x.to, label: x.label || '', name: x.name, mine: x.pathiId === id })) }));
        const vouchers = Object.values(mem.expenses).filter(e => e.pathiId === id).map(e => ({ no: e.no, amount: e.amount, method: e.method, date: e.date, ref: e.ref || '', void: !!e.void, pathType: e.pathType || '', pathDate: e.pathDate || '' }));
        save();
        return { ok: true, name: p.name, unavailable: p.unavailable || [], paths, avail: p.avail, usual: p.usual || '', rosters, vouchers, gurdwara: { name: mem.settings.name, phone: mem.settings.phone } };
      },
      // Seva sign-up for a programme (anyone).
      async addSignup(o) { mem.signups['g' + Date.now().toString(36)] = { ...o, createdAt: new Date().toISOString() }; change(); },
      async deleteSignup(id) { delete mem.signups[id]; change(); },
      // Demo only: pretend a WhatsApp message failed, to see the warning.
      demoFailNotice(ref) { mem.notices[ref + '_demo' + Date.now()] = { ref, event: 'booked', template: 'path_booking_confirmed', to: '919999999999', status: 'failed', error: '131026 Message undeliverable (number not on WhatsApp)', createdAt: new Date().toISOString(), params: [] }; change(); }
    };
    return withLog(demoApi, x => { mem.log['l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)] = { ...x, at: new Date().toISOString(), by: me.uid, email: me.email, name: me.name, role: me.role }; change(); });
  }

  // ---------- Firebase ----------
  // Loads the Firebase SDK and connects to the database named in firebase-config.js
  // (databaseId; "(default)" if not set).
  const V = '10.12.2', BASE = 'https://www.gstatic.com/firebasejs/' + V + '/';
  const ready = (async () => {
    const [A, F, U] = await Promise.all([import(BASE + 'firebase-app.js'), import(BASE + 'firebase-firestore.js'), import(BASE + 'firebase-auth.js')]);
    const app = A.initializeApp(cfg);
    return { F, U, db: F.getFirestore(app, cfg.databaseId || '(default)'), auth: U.getAuth(app) };
  })();
  const ADMIN_COLLECTIONS = ['admins', 'Gurlal'];
  let lastSettings = cleanSettings(null);
  const toPlain = v => { const o = {}; for (const [k, x] of Object.entries(v || {})) o[k] = x; return o; };

  // Issue a numbered receipt inside a transaction (numbers restart each financial year).
  // Path bheta and seva bheta each get their own numbered receipt (separate series), in one transaction.
  async function issueReceipt(F, db, ref, amount, method, utr, extra, seva) {
    seva = Math.max(0, Math.round(seva || 0));
    return F.runTransaction(db, async tx => {
      const lref = F.doc(db, 'lookup', ref), cref = F.doc(db, 'counters', 'receipts'), sref = F.doc(db, 'counters', 'seva');
      const [ls, cs, ss] = [await tx.get(lref), await tx.get(cref), await tx.get(sref)];
      if (!ls.exists()) throw new Error('missing');
      const fy = G.finYear(), l = ls.data(), date = new Date().toISOString(), up = { ...extra(l) }, out = { no: '', sevaNo: '' };
      if (amount > 0) {
        const next = cs.exists() && cs.data().fy === fy ? cs.data().next : 1;
        out.no = receiptNo(lastSettings.receiptPrefix, fy, next);
        tx.set(cref, { fy, next: next + 1 });
        up.receipts = [...(l.receipts || []), { no: out.no, amount, method, utr: utr || '', date, by: who() }];
      }
      if (seva > 0) {
        const next = ss.exists() && ss.data().fy === fy ? ss.data().next : 1;
        out.sevaNo = receiptNo(lastSettings.sevaPrefix, fy, next);
        tx.set(sref, { fy, next: next + 1 });
        up.sevaReceipts = [...(l.sevaReceipts || []), { no: out.sevaNo, amount: seva, method, utr: utr || '', date, by: who() }];
      }
      tx.update(lref, up);
      return out;
    });
  }

  const fbApi = {
    demo: false,
    me: () => me,
    // Committee-only server actions (WhatsApp buttons, backup): sends the signed-in user's Firebase token.
    async callFn(name, body) {
      const { auth } = await ready, u = auth.currentUser; if (!u) throw new Error('signed out');
      const r = await fetch('/.netlify/functions/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await u.getIdToken() }, body: JSON.stringify(body || {}) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || ('HTTP ' + r.status)), { status: r.status }); return j;
    },
    // Asks the server to send the automatic WhatsApp message (does nothing if WhatsApp is not set up).
    notify(ref, event, extra) {
      try { fetch('/.netlify/functions/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref, event, ...(extra || {}) }), keepalive: true }).catch(() => {}); } catch (e) {}
    },
    watchSlots(cb, onErr) {
      ready.then(({ F, db }) => F.onSnapshot(F.query(F.collection(db, 'slots'), F.where('date', '>=', G.today)),
        { includeMetadataChanges: true },
        snap => { const s = {}; snap.forEach(d => { s[d.id] = d.data(); }); cb(s, snap.metadata.fromCache); },
        e => { console.error('Bookings:', e); onErr && onErr(e); }))
        .catch(e => { console.error('Firebase failed to load:', e); onErr && onErr(e); });
    },
    watchSettings(cb) {
      ready.then(({ F, db }) => F.onSnapshot(F.doc(db, 'settings', 'main'),
        d => { lastSettings = cleanSettings(d.exists() ? d.data() : null); cb(lastSettings); },
        e => { console.error('Settings:', e); cb(lastSettings); })).catch(() => cb(lastSettings));
    },
    // Live account for one booking (the devotee's own view, by reference).
    watchLookup(ref, cb) {
      ready.then(({ F, db }) => F.onSnapshot(F.doc(db, 'lookup', ref), d => cb(d.exists() ? toPlain(d.data()) : null), e => console.error('Lookup:', e)));
    },
    // Tries each free place in turn, so two families booking at the same moment both get a place
    // when more than one is open. The database rules refuse any place that is already taken.
    async book(t, date, info, opts) {
      const { F, db } = await ready;
      const ref = G.makeRef();
      let closedOrFull = false;
      for (let seat = 1; seat <= G.capOf(lastSettings, t.key); seat++) {
        const { ids, docs, contact } = buildDocs(t, date, info, ref, seat, F.serverTimestamp());
        const taken = await Promise.all(ids.map(id => F.getDoc(F.doc(db, 'slots', id)).then(s => s.exists())));
        if (taken.some(Boolean)) continue;
        const batch = F.writeBatch(db);
        docs.forEach(([id, d]) => batch.set(F.doc(db, 'slots', id), { ...d, createdAt: F.serverTimestamp() }));
        batch.set(F.doc(db, 'contacts', ids[0]), { ...contact, createdAt: F.serverTimestamp() });
        batch.set(F.doc(db, 'lookup', ref), newLookup(t, date, info.name, ids[0], lastSettings));
        try { await batch.commit(); return ref; }
        catch (e) {
          if (!(e && e.code === 'permission-denied')) throw e;
          const again = await F.getDoc(F.doc(db, 'slots', ids[0])).catch(() => null);
          if (again && again.exists()) continue;
          closedOrFull = true; break;
        }
      }
      throw new Error(closedOrFull ? 'refused' : 'taken');
    },
    async findBooking(ref) {
      const { F, db } = await ready;
      const l = await F.getDoc(F.doc(db, 'lookup', ref));
      if (!l.exists()) return null;
      const id = l.data().slot;
      const s = await F.getDoc(F.doc(db, 'slots', id));
      return { id, ref, data: s.exists() ? s.data() : null, l: toPlain(l.data()) };
    },
    // Move a booking to a new date in one step. The rules check the phone number matches
    // the booking and that it is within 48 hours of booking, then remove the old date and add the new one.
    async reschedule(b, phone, date) {
      const { F, db } = await ready;
      const t = G.typeOf(b.data.type);
      if (!G.canReschedule(b.data)) throw new Error('late');
      const old = idsOf(b.data), pkey = G.phoneKey(phone);
      let refused = false;
      for (let seat = 1; seat <= G.capOf(lastSettings, t.key); seat++) {
        const { ids, docs, contact } = buildDocs(t, date, { name: b.data.name, occasion: b.data.occasion, phone, note: '' }, b.ref, seat, b.data.bookedAt);
        if (ids.some(id => old.includes(id))) continue;
        const taken = await Promise.all(ids.map(id => F.getDoc(F.doc(db, 'slots', id)).then(s => s.exists())));
        if (taken.some(Boolean)) continue;
        const batch = F.writeBatch(db);
        batch.set(F.doc(db, 'reschedules', b.id + '_' + b.ref), { old: b.id, ref: b.ref, pkey, next: ids[0], createdAt: F.serverTimestamp() });
        old.forEach(id => batch.delete(F.doc(db, 'slots', id)));
        batch.delete(F.doc(db, 'contacts', b.id));
        docs.forEach(([id, d]) => batch.set(F.doc(db, 'slots', id), { ...d, createdAt: F.serverTimestamp() }));
        batch.set(F.doc(db, 'contacts', ids[0]), { ...contact, createdAt: F.serverTimestamp() });
        batch.update(F.doc(db, 'lookup', b.ref), { slot: ids[0], prev: b.id, start: date });
        try { await batch.commit(); return b.ref; }
        catch (e) {
          if (!(e && e.code === 'permission-denied')) throw e;
          const again = await F.getDoc(F.doc(db, 'slots', ids[0])).catch(() => null);
          if (again && again.exists()) continue;
          refused = true; break;
        }
      }
      throw new Error(refused ? 'nomatch' : 'taken');
    },
    // Devotee: "I have paid" with the UPI transaction ID. The committee confirms it later.
    async reportPayment(ref, utr, amount, seva) {
      seva = Math.max(0, Math.round(seva || 0));
      const { F, db } = await ready;
      const ls = await F.getDoc(F.doc(db, 'lookup', ref));
      if (!ls.exists()) throw new Error('missing');
      const l = ls.data(), a = G.account(l);
      if (!a.paid && !l.checking && amount < a.advance) throw new Error('advance');
      const n = (l.reports || 0) + 1;
      const batch = F.writeBatch(db);
      batch.set(F.doc(db, 'reports', ref + '_' + n), { ref, utr, amount, seva, createdAt: F.serverTimestamp() });
      batch.update(F.doc(db, 'lookup', ref), { reports: n, checking: true });
      await batch.commit();
    },
    // cb(user, isCommittee, role, info). The first members (admins / Gurlal collections) are Pardhan / Admin.
    // Others are invited by email on the Users panel; after verifying their email they become committee users.
    onAuth(cb) {
      ready.then(({ F, U, db, auth }) => U.onAuthStateChanged(auth, async u => {
        me = null;
        if (!u) return cb(null, false, null, {});
        const email = String(u.email || '').toLowerCase(), get = p => F.getDoc(F.doc(db, ...p)).catch(() => null);
        try {
          for (const c of ADMIN_COLLECTIONS) { const d = await get([c, u.uid]);
            if (d && d.exists()) { me = { uid: u.uid, email, name: u.displayName || email.split('@')[0], role: 'admin', owner: true }; return cb(u, true, 'admin', {}); } }
          let st = await get(['staff', u.uid]);
          if (!(st && st.exists())) {
            const inv = await get(['invites', email]);
            if (inv && inv.exists()) {
              if (!u.emailVerified) await u.reload().catch(() => {});
              if (!auth.currentUser.emailVerified) return cb(u, false, null, { needVerify: true });
              await u.getIdToken(true);
              const d = inv.data();
              await F.setDoc(F.doc(db, 'staff', u.uid), { email, name: d.name, role: d.role, active: true, createdAt: F.serverTimestamp() });
              await F.deleteDoc(F.doc(db, 'invites', email)).catch(() => {});
              st = await get(['staff', u.uid]);
            }
          }
          if (st && st.exists() && st.data().active) { const d = st.data(); me = { uid: u.uid, email, name: d.name || email, role: d.role }; return cb(u, true, d.role, {}); }
          cb(u, false, null, { disabled: !!(st && st.exists()) });
        } catch (e) { console.error('Role check:', e); cb(u, false, null, { error: true }); }
      }));
    },
    async signIn(email, pass) { const { U, auth } = await ready; return U.signInWithEmailAndPassword(auth, email, pass); },
    // An invited sevadar / Khazanchi makes their own password; Firebase sends a link to confirm the email first.
    async signUp(email, pass) { const { U, auth } = await ready; const c = await U.createUserWithEmailAndPassword(auth, email, pass); await U.sendEmailVerification(c.user); return c; },
    async resendVerification() { const { U, auth } = await ready; if (auth.currentUser) await U.sendEmailVerification(auth.currentUser); },
    async signOut() { const { U, auth } = await ready; return U.signOut(auth); },
    async resetPassword(email) { const { U, auth } = await ready; return U.sendPasswordResetEmail(auth, email); },
    // Committee: everything for the bookings list, live.
    watchAdmin(cb) {
      const st = { slots: {}, contacts: {}, lookups: {}, reports: {}, counters: {}, sevaonly: {}, sevacontacts: {}, expenses: {}, rosters: {}, pathis: {}, notices: {}, signups: {} };
      const out = () => cb({ ...st });
      ready.then(({ F, db }) => {
        const on = (q, key) => F.onSnapshot(q, snap => { const m = {}; snap.forEach(d => { m[d.id] = toPlain(d.data()); }); st[key] = m; out(); }, e => console.error(key, e));
        on(F.query(F.collection(db, 'slots'), F.where('date', '>=', pastFrom())), 'slots');
        on(F.collection(db, 'contacts'), 'contacts');
        on(F.collection(db, 'lookup'), 'lookups');
        on(F.collection(db, 'reports'), 'reports');
        on(F.collection(db, 'counters'), 'counters');
        on(F.collection(db, 'sevaonly'), 'sevaonly');
        on(F.collection(db, 'sevacontacts'), 'sevacontacts');
        if (me && G.roleAtLeast(me.role, 'treasurer')) on(F.collection(db, 'expenses'), 'expenses');
        on(F.collection(db, 'rosters'), 'rosters');
        on(F.collection(db, 'pathis'), 'pathis');
        on(F.query(F.collection(db, 'notices'), F.where('status', '==', 'failed')), 'notices');
        on(F.collection(db, 'signups'), 'signups');
      });
    },
    // ---------- Users and activity log (Pardhan / Admin) ----------
    watchStaff(cb) {
      const st = { staff: {}, invites: {} };
      ready.then(({ F, db }) => ['staff', 'invites'].forEach(k => F.onSnapshot(F.collection(db, k),
        snap => { const m = {}; snap.forEach(d => { m[d.id] = toPlain(d.data()); }); st[k] = m; cb({ ...st }); }, e => console.error(k, e))));
    },
    watchLog(cb) {
      ready.then(({ F, db }) => F.onSnapshot(F.query(F.collection(db, 'log'), F.orderBy('at', 'desc'), F.limit(300)),
        snap => { const out = []; snap.forEach(d => { const x = toPlain(d.data()); x.at = x.at && x.at.toDate ? x.at.toDate().toISOString() : x.at; out.push([d.id, x]); }); cb(out); }, e => console.error('log', e)));
    },
    async invite(email, name, role) { const { F, db } = await ready; return F.setDoc(F.doc(db, 'invites', email.toLowerCase()), { name, role, createdAt: F.serverTimestamp(), by: who() }); },
    async cancelInvite(email) { const { F, db } = await ready; return F.deleteDoc(F.doc(db, 'invites', email)); },
    async setStaff(uid, data) { const { F, db } = await ready; return F.updateDoc(F.doc(db, 'staff', uid), data); },
    // ---------- Pathi Singhs and rosters ----------
    async addPathi(o) {
      const { F, db } = await ready, id = randomId(20), pin = newPin(), batch = F.writeBatch(db);
      batch.set(F.doc(db, 'pathis', id), { name: o.name, phone: o.phone || '', note: o.note || '', active: true, unavailable: [], createdAt: F.serverTimestamp() });
      batch.set(F.doc(db, 'pathipins', id), { hash: await pinHash(id, pin), fails: 0, lockUntil: 0 });
      await batch.commit(); return { id, pin };
    },
    async updatePathi(id, data) { const { F, db } = await ready; return F.updateDoc(F.doc(db, 'pathis', id), data); },
    async resetPin(id) { const { F, db } = await ready, pin = newPin(); await F.setDoc(F.doc(db, 'pathipins', id), { hash: await pinHash(id, pin), fails: 0, lockUntil: 0 }); return pin; },
    async saveRoster(o) { const { F, db } = await ready; return F.setDoc(F.doc(db, 'rosters', o.ref), { ...cleanRoster(o), updatedAt: F.serverTimestamp(), by: who() }); },
    // The Pathi Singh's page: the server checks the PIN and sends back only their own roster and vouchers.
    async pathiView(id, pin, action, extra) {
      const body = { id, pin, action, ...(Array.isArray(extra) ? { dates: extra } : (extra || {})) };
      const r = await fetch('/.netlify/functions/pathi', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return r.json().catch(() => ({ error: 'server' }));
    },
    // ---------- Seva sign-up for programmes ----------
    async addSignup(o) { const { F, db } = await ready; return F.addDoc(F.collection(db, 'signups'), { ...o, createdAt: F.serverTimestamp() }); },
    async deleteSignup(id) { const { F, db } = await ready; return F.deleteDoc(F.doc(db, 'signups', id)); },
    // ---------- Money paid out by the gurdwara (payment vouchers) ----------
    async addExpense(o) {
      const { F, db } = await ready, eref = F.doc(F.collection(db, 'expenses'));
      await F.runTransaction(db, async tx => {
        const cref = F.doc(db, 'counters', 'expense'), cs = await tx.get(cref);
        const fy = G.finYear(), next = cs.exists() && cs.data().fy === fy ? cs.data().next : 1, date = new Date().toISOString();
        tx.set(cref, { fy, next: next + 1 });
        tx.set(eref, { ...o, no: receiptNo(lastSettings.expensePrefix || 'EXP', fy, next), date, createdAt: date, by: who() });
      });
      return eref.id;
    },
    async voidExpense(id, reason, note) {
      const { F, db } = await ready;
      return F.updateDoc(F.doc(db, 'expenses', id), { void: { reason, note: note || '', date: new Date().toISOString(), by: who() } });
    },
    async getExpense(id) { const { F, db } = await ready; const s = await F.getDoc(F.doc(db, 'expenses', id)); return s.exists() ? s.data() : null; },
    // ---------- Seva bheta without a path booking ----------
    async reportSevaOnly(o) {
      const { F, db } = await ready;
      const batch = F.writeBatch(db);
      batch.set(F.doc(db, 'sevaonly', o.ref), { name: o.name, amount: o.amount, purpose: o.purpose, utr: o.utr, status: 'checking', createdAt: F.serverTimestamp() });
      batch.set(F.doc(db, 'sevacontacts', o.ref), { phone: o.phone, pkey: G.phoneKey(o.phone), createdAt: F.serverTimestamp() });
      await batch.commit();
    },
    watchSevaOnly(ref, cb) {
      ready.then(({ F, db }) => F.onSnapshot(F.doc(db, 'sevaonly', ref), s => cb(s.exists() ? s.data() : null), () => cb(null)));
    },
    async getSevaOnly(ref) { const { F, db } = await ready; const s = await F.getDoc(F.doc(db, 'sevaonly', ref)); return s.exists() ? s.data() : null; },
    async verifySevaOnly(ref) {
      const { F, db } = await ready;
      return F.runTransaction(db, async tx => {
        const dref = F.doc(db, 'sevaonly', ref), cref = F.doc(db, 'counters', 'seva');
        const [ds, cs] = [await tx.get(dref), await tx.get(cref)];
        if (!ds.exists() || ds.data().status !== 'checking') return '';
        const d = ds.data(), fy = G.finYear(), next = cs.exists() && cs.data().fy === fy ? cs.data().next : 1;
        const no = receiptNo(lastSettings.sevaPrefix || 'SEVA', fy, next);
        tx.set(cref, { fy, next: next + 1 });
        tx.update(dref, { status: 'verified', receipt: { no, amount: d.amount, method: 'UPI', utr: d.utr || '', date: new Date().toISOString(), by: who() } });
        return no;
      });
    },
    async rejectSevaOnly(ref) { const { F, db } = await ready; return F.updateDoc(F.doc(db, 'sevaonly', ref), { status: 'rejected' }); },
    async recordSevaAtOffice(o) {
      const { F, db } = await ready, ref = G.makeSevaRef();
      await F.runTransaction(db, async tx => {
        const cref = F.doc(db, 'counters', 'seva'), cs = await tx.get(cref);
        const fy = G.finYear(), next = cs.exists() && cs.data().fy === fy ? cs.data().next : 1, date = new Date().toISOString();
        const no = receiptNo(lastSettings.sevaPrefix || 'SEVA', fy, next);
        tx.set(cref, { fy, next: next + 1 });
        tx.set(F.doc(db, 'sevaonly', ref), { name: o.name, amount: o.amount, purpose: o.purpose, note: o.note || '', status: 'verified', office: true,
          createdAt: date, receipt: { no, amount: o.amount, method: o.method, utr: '', date, by: who() } });
        if (o.phone) tx.set(F.doc(db, 'sevacontacts', ref), { phone: o.phone, pkey: G.phoneKey(o.phone), createdAt: date });
      });
      return ref;
    },
    async voidSevaOnly(ref, reason, note) {
      const { F, db } = await ready;
      return F.runTransaction(db, async tx => {
        const dref = F.doc(db, 'sevaonly', ref), ds = await tx.get(dref);
        if (!ds.exists() || !ds.data().receipt || ds.data().receipt.void) return;
        tx.update(dref, { receipt: { ...ds.data().receipt, void: { reason, note: note || '', date: new Date().toISOString(), by: who() } } });
      });
    },
    // Committee: the number the next receipt of a series will get ('receipts' = path, 'seva' = seva), this financial year.
    async setNextReceipt(key, next) {
      const { F, db } = await ready;
      return F.setDoc(F.doc(db, 'counters', key), { fy: G.finYear(), next });
    },
    async verifyReport(id, stillChecking) {
      const { F, db } = await ready;
      const r = (await F.getDoc(F.doc(db, 'reports', id))).data();
      const o = await issueReceipt(F, db, r.ref, r.amount, 'UPI', r.utr,
        l => ({ paidOnline: (l.paidOnline || 0) + r.amount, checking: !!stillChecking }), r.seva);
      await F.updateDoc(F.doc(db, 'reports', id), { status: 'verified', receiptNo: o.no, sevaReceiptNo: o.sevaNo });
      return o;
    },
    async rejectReport(id, stillChecking) {
      const { F, db } = await ready;
      const r = (await F.getDoc(F.doc(db, 'reports', id))).data();
      const batch = F.writeBatch(db);
      batch.update(F.doc(db, 'reports', id), { status: 'rejected' });
      batch.update(F.doc(db, 'lookup', r.ref), { checking: !!stillChecking });
      await batch.commit();
    },
    async recordCash(ref, amount, method, seva) {
      const { F, db } = await ready;
      return issueReceipt(F, db, ref, amount, method || 'Cash', '', l => (amount ? { paidCash: (l.paidCash || 0) + amount } : {}), seva);
    },
    async setClosed(ref, closed) { const { F, db } = await ready; return F.updateDoc(F.doc(db, 'lookup', ref), { closed: closed || '' }); },
    async getContact(id) { const { F, db } = await ready; const d = await F.getDoc(F.doc(db, 'contacts', id)); return d.exists() ? d.data() : null; },
    // Frees the dates. A booking with money received is kept as "cancelled" for the records.
    async cancel(startId, reason) {
      const { F, db } = await ready;
      const s = await F.getDoc(F.doc(db, 'slots', startId));
      if (!s.exists()) return;
      const batch = F.writeBatch(db);
      idsOf(s.data()).forEach(id => batch.delete(F.doc(db, 'slots', id)));
      const c = await F.getDoc(F.doc(db, 'contacts', startId)).catch(() => null);
      const ref = c && c.exists() && c.data().ref;
      const l = ref ? await F.getDoc(F.doc(db, 'lookup', ref)).catch(() => null) : null;
      // The booking is kept as Cancelled so the devotee can be told; an unpaid one can then be removed with "Delete entry".
      // Its contact moves to "cx_<ref>" so the date and place can be booked again by someone else.
      if (l && l.exists()) {
        const cid = 'cx_' + ref;
        batch.set(F.doc(db, 'contacts', cid), c.data());
        batch.update(F.doc(db, 'lookup', ref), { closed: 'cancelled', cancelReason: reason || '', closedAt: new Date().toISOString(), slot: cid, cancelledSlot: startId, closedBy: who() });
      }
      batch.delete(F.doc(db, 'contacts', startId));
      await batch.commit();
      return ref || '';
    },
    // Committee: mark a receipt void (number is kept, never reused); path amounts come off the paid total.
    async voidReceipt(ref, kind, i, reason, note) {
      const { F, db } = await ready;
      return F.runTransaction(db, async tx => {
        const lref = F.doc(db, 'lookup', ref), ls = await tx.get(lref); if (!ls.exists()) throw new Error('missing');
        const l = ls.data(), key = kind === 'seva' ? 'sevaReceipts' : 'receipts', arr = [...(l[key] || [])], r = arr[i];
        if (!r || r.void) return;
        arr[i] = { ...r, void: { reason, note: note || '', date: new Date().toISOString(), by: who() } };
        const up = { [key]: arr };
        if (kind !== 'seva') { if (r.method === 'UPI') up.paidOnline = Math.max(0, (l.paidOnline || 0) - r.amount); else up.paidCash = Math.max(0, (l.paidCash || 0) - r.amount); }
        tx.update(lref, up);
      });
    },
    // Committee: money given back to the devotee, with its own refund voucher number.
    async refund(ref, amount, method, reason, note) {
      const { F, db } = await ready;
      return F.runTransaction(db, async tx => {
        const lref = F.doc(db, 'lookup', ref), cref = F.doc(db, 'counters', 'refund');
        const [ls, cs] = [await tx.get(lref), await tx.get(cref)]; if (!ls.exists()) throw new Error('missing');
        const fy = G.finYear(), next = cs.exists() && cs.data().fy === fy ? cs.data().next : 1, l = ls.data();
        const no = receiptNo(lastSettings.refundPrefix || 'REFUND', fy, next);
        tx.set(cref, { fy, next: next + 1 });
        tx.update(lref, { refunds: [...(l.refunds || []), { no, amount, method, reason, note: note || '', date: new Date().toISOString(), by: who() }], refunded: (l.refunded || 0) + amount });
        return no;
      });
    },
    // Committee: remove a booking that never had any payment (all its records).
    async deleteEntry(ref, reportIds) {
      const { F, db } = await ready;
      const ls = await F.getDoc(F.doc(db, 'lookup', ref)); if (!ls.exists()) return;
      const l = ls.data(); if (G.hasMoney(l)) throw new Error('has-money');
      const batch = F.writeBatch(db);
      if (l.slot) {
        const s = await F.getDoc(F.doc(db, 'slots', l.slot)).catch(() => null);
        if (s && s.exists()) idsOf(s.data()).forEach(id => batch.delete(F.doc(db, 'slots', id)));
        batch.delete(F.doc(db, 'contacts', l.slot));
      }
      (reportIds || []).forEach(id => batch.delete(F.doc(db, 'reports', id)));
      batch.delete(F.doc(db, 'lookup', ref));
      await batch.commit();
    },
    async saveSettings(s) { const { F, db } = await ready; return F.setDoc(F.doc(db, 'settings', 'main'), cleanSettings(s)); }
  };
  return withLog(fbApi, x => ready.then(({ F, db }) => F.addDoc(F.collection(db, 'log'),
    { ...x, at: F.serverTimestamp(), by: me.uid, email: me.email, name: me.name || '', role: me.role })).catch(e => console.error('Log write:', e)));
})();
