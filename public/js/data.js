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
      includes: Array.isArray(v.includes) ? v.includes.map(x => String(x).trim().slice(0, 120)).filter(Boolean).slice(0, 12) : [],
      bigEvent: String(v.bigEvent || '').trim().slice(0, 1500),
      sukhmaniNote: String(v.sukhmaniNote || '').trim().slice(0, 1500),
      granthis: Array.isArray(v.granthis) ? v.granthis.slice(0, 20).map(g => ({ name: String(g.name || '').trim().slice(0, 60),
        phone: String(g.phone || '').trim().slice(0, 20), note: String(g.note || '').trim().slice(0, 80) })).filter(g => g.name && g.phone) : [] };
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

  // ---------- Demo store ----------
  if (DEMO) {
    const KEY = 'gpb-demo-v3';
    const load = () => { let m; try { m = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { m = {}; }
      ['slots', 'contacts', 'lookup', 'reports', 'counters'].forEach(k => { m[k] = m[k] || {}; });
      m.settings = cleanSettings(m.settings); return m; };
    let mem = load();
    const subs = { slots: [], settings: [], auth: [], admin: [], lookup: [] };
    let demoUser = null;
    try { demoUser = sessionStorage.getItem('gpb-demo-admin') ? { email: 'demo@committee' } : null; } catch (e) {}
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) {} };
    const clone = o => JSON.parse(JSON.stringify(o));
    const emit = () => {
      const s = {}; for (const [k, v] of Object.entries(mem.slots)) if (v.date >= G.today) s[k] = v;
      subs.slots.forEach(f => f(s, false)); subs.settings.forEach(f => f(mem.settings));
      const all = {}; for (const [k, v] of Object.entries(mem.slots)) if (v.date >= pastFrom()) all[k] = v;
      subs.admin.forEach(f => f(clone({ slots: all, contacts: mem.contacts, lookups: mem.lookup, reports: mem.reports })));
      subs.lookup.forEach(([ref, f]) => f(mem.lookup[ref] ? clone(mem.lookup[ref]) : null));
    };
    const change = () => { save(); emit(); };
    window.addEventListener('storage', e => { if (e.key === KEY) { mem = load(); emit(); } });
    // Path bheta and seva bheta each get their own receipt from their own number series.
    const issue = (ref, amount, method, utr, seva) => {
      const fy = G.finYear(), l = mem.lookup[ref], date = new Date().toISOString(), out = { no: '', sevaNo: '' };
      const take = (key, prefix) => { const c = mem.counters[key] && mem.counters[key].fy === fy ? mem.counters[key] : { fy, next: 1 };
        mem.counters[key] = { fy, next: c.next + 1 }; return receiptNo(prefix, fy, c.next); };
      if (amount > 0) { out.no = take('receipts', mem.settings.receiptPrefix); l.receipts = [...(l.receipts || []), { no: out.no, amount, method, utr: utr || '', date }]; }
      if (seva > 0) { out.sevaNo = take('seva', mem.settings.sevaPrefix); l.sevaReceipts = [...(l.sevaReceipts || []), { no: out.sevaNo, amount: seva, method, utr: utr || '', date }]; }
      return out;
    };
    return {
      demo: true,
      notify() {},
      watchSlots(cb) { subs.slots.push(cb); setTimeout(emit, 50); },
      watchSettings(cb) { subs.settings.push(cb); setTimeout(() => cb(mem.settings), 50); },
      watchLookup(ref, cb) { subs.lookup.push([ref, cb]); setTimeout(emit, 50); },
      async book(t, date, info) {
        const seats = G.freeSeats(t, date, mem.slots, mem.settings);
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
      async recordCash(ref, amount, method, seva) {
        const l = mem.lookup[ref]; const o = issue(ref, amount, method || 'Cash', '', seva || 0);
        l.paidCash = (l.paidCash || 0) + amount; change(); return o;
      },
      async setClosed(ref, closed) { mem.lookup[ref].closed = closed || ''; change(); },
      onAuth(cb) { subs.auth.push(cb); setTimeout(() => cb(demoUser, !!demoUser), 50); },
      async signIn(email, pass) {
        if (pass !== 'demo') throw new Error('wrong');
        demoUser = { email: email || 'demo@committee' };
        try { sessionStorage.setItem('gpb-demo-admin', '1'); } catch (e) {}
        subs.auth.forEach(f => f(demoUser, true));
      },
      async signOut() { demoUser = null; try { sessionStorage.removeItem('gpb-demo-admin'); } catch (e) {} subs.auth.forEach(f => f(null, false)); },
      async getContact(id) { return mem.contacts[id] || null; },
      // Frees the dates. A booking with money received is kept as "cancelled" for the records.
      async cancel(startId) {
        const v = mem.slots[startId]; if (!v) return;
        idsOf(v).forEach(id => delete mem.slots[id]);
        const c = mem.contacts[startId], l = c && c.ref && mem.lookup[c.ref];
        if (l && G.account(l).paid > 0) l.closed = 'cancelled';
        else { if (c && c.ref) delete mem.lookup[c.ref]; delete mem.contacts[startId]; }
        change();
      },
      async saveSettings(s) { mem.settings = cleanSettings(s); change(); },
      async resetPassword() {}
    };
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
        up.receipts = [...(l.receipts || []), { no: out.no, amount, method, utr: utr || '', date }];
      }
      if (seva > 0) {
        const next = ss.exists() && ss.data().fy === fy ? ss.data().next : 1;
        out.sevaNo = receiptNo(lastSettings.sevaPrefix, fy, next);
        tx.set(sref, { fy, next: next + 1 });
        up.sevaReceipts = [...(l.sevaReceipts || []), { no: out.sevaNo, amount: seva, method, utr: utr || '', date }];
      }
      tx.update(lref, up);
      return out;
    });
  }

  return {
    demo: false,
    // Asks the server to send the automatic WhatsApp message (does nothing if WhatsApp is not set up).
    notify(ref, event) {
      try { fetch('/.netlify/functions/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref, event }), keepalive: true }).catch(() => {}); } catch (e) {}
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
    async book(t, date, info) {
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
    onAuth(cb) {
      ready.then(({ F, U, db, auth }) => U.onAuthStateChanged(auth, async u => {
        if (!u) return cb(null, false);
        let admin = false;
        for (const c of ADMIN_COLLECTIONS) {
          try { if ((await F.getDoc(F.doc(db, c, u.uid))).exists()) { admin = true; break; } } catch (e) { console.error('Admin check:', e); }
        }
        cb(u, admin);
      }));
    },
    async signIn(email, pass) { const { U, auth } = await ready; return U.signInWithEmailAndPassword(auth, email, pass); },
    async signOut() { const { U, auth } = await ready; return U.signOut(auth); },
    async resetPassword(email) { const { U, auth } = await ready; return U.sendPasswordResetEmail(auth, email); },
    // Committee: everything for the bookings list, live.
    watchAdmin(cb) {
      const st = { slots: {}, contacts: {}, lookups: {}, reports: {} };
      const out = () => cb({ ...st });
      ready.then(({ F, db }) => {
        const on = (q, key) => F.onSnapshot(q, snap => { const m = {}; snap.forEach(d => { m[d.id] = toPlain(d.data()); }); st[key] = m; out(); }, e => console.error(key, e));
        on(F.query(F.collection(db, 'slots'), F.where('date', '>=', pastFrom())), 'slots');
        on(F.collection(db, 'contacts'), 'contacts');
        on(F.collection(db, 'lookup'), 'lookups');
        on(F.collection(db, 'reports'), 'reports');
      });
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
    async cancel(startId) {
      const { F, db } = await ready;
      const s = await F.getDoc(F.doc(db, 'slots', startId));
      if (!s.exists()) return;
      const batch = F.writeBatch(db);
      idsOf(s.data()).forEach(id => batch.delete(F.doc(db, 'slots', id)));
      const c = await F.getDoc(F.doc(db, 'contacts', startId)).catch(() => null);
      const ref = c && c.exists() && c.data().ref;
      const l = ref ? await F.getDoc(F.doc(db, 'lookup', ref)).catch(() => null) : null;
      if (l && l.exists() && G.account(l.data()).paid > 0) batch.update(F.doc(db, 'lookup', ref), { closed: 'cancelled' });
      else { if (ref) batch.delete(F.doc(db, 'lookup', ref)); batch.delete(F.doc(db, 'contacts', startId)); }
      await batch.commit();
    },
    async saveSettings(s) { const { F, db } = await ready; return F.setDoc(F.doc(db, 'settings', 'main'), cleanSettings(s)); }
  };
})();
