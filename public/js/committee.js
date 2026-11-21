// Committee page, part 2: sections (tabs), Pathi Singhs and rosters, WhatsApp messages,
// monthly report, programmes and seva sign-ups, users, activity log and backup.
// Uses what admin.html shares in window.ADM.
(function () {
  const { S, X, API, G, $, M$, can, renderList } = window.ADM;
  const esc = G.esc, area = $('adminArea');
  Object.assign(S, { rosterOpen: {}, draft: {}, pinShown: null, staffData: { staff: {}, invites: {} }, log: [] });
  const tryLS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  const note = (el, cls, html) => { el.innerHTML = `<div class="note ${cls}">${html}</div>`; };
  const fnError = x => x && x.status === 403 ? 'Not allowed for your role.' : x && /not set up/.test(x.message) ? esc(x.message) : 'Could not reach the server. Check your internet connection and try again.';

  // ---------- New panels ----------
  const panels = `
  <div class="panel" data-tab="money" data-need="treasurer" id="reportPanel">
    <h3>Monthly report</h3>
    <p class="hint">One page for the committee meeting: paths done, bheta and seva received, refunds, payments made and the balance.</p>
    <div class="row" style="align-items:flex-end">
      <label for="mr-month" style="width:auto">Month<input id="mr-month" type="month"></label>
      <button class="btn" type="button" id="mrOpen">Open report (print or save as PDF)</button>
      <button class="btn ghost" type="button" id="mrXlsx">Download month (Excel)</button>
    </div>
    <div id="mrSummary" class="meta" style="margin-top:8px"></div>
  </div>

  <div class="panel" data-tab="pathis" id="pathiPanel">
    <h3>Pathi Singhs</h3>
    <p class="hint">Each Pathi Singh gets a private link and a 4-digit PIN to see their own rauls, the full roster and the bheta paid to them, and to mark days they are not available. They do not see any family's phone number or payments. Make rosters from each booking (Roster button).</p>
    <form id="paForm" novalidate data-need="treasurer">
      <div class="row" style="align-items:flex-end">
        <label for="pa-name" style="width:auto">Name<input id="pa-name" maxlength="80" autocomplete="off" placeholder="ਭਾਈ … ਸਿੰਘ ਜੀ"></label>
        <label for="pa-phone" style="width:auto">Phone (WhatsApp)<input id="pa-phone" type="tel" inputmode="tel" maxlength="20" autocomplete="off"></label>
        <label for="pa-note" style="min-width:0;flex:1">Note <span class="hint">optional</span><input id="pa-note" maxlength="120" autocomplete="off"></label>
      </div>
      <div id="paMsg"></div>
      <div class="row"><button class="btn" type="submit">Add Pathi Singh</button></div>
    </form>
    <div id="pinBox"></div>
    <div id="paList" style="margin-top:12px"></div>
  </div>

  <div class="panel" data-tab="whatsapp" id="waPanel">
    <h3>WhatsApp messages not delivered</h3>
    <p class="hint">When a message cannot reach a family (for example the number is not on WhatsApp, or the token has a problem), it shows here and on the booking. Please call the family. "Send again" sends the same message once more.</p>
    <div id="waList"></div>
    <details style="margin-top:12px"><summary>How delivery tracking works</summary>
      <p class="hint">Meta tells this website when a message fails, through a webhook. It needs a one-time setup in Meta (see the setup notes). Until then, only messages that fail at sending time show here.</p></details>
  </div>

  <div class="panel" data-tab="programmes" id="progPanel">
    <h3>Programmes and gurpurabs</h3>
    <p class="hint">Shown on the booking page under "ਆਉਣ ਵਾਲੇ ਸਮਾਗਮ". The sangat can give their name for seva on that day. Closing the date for path bookings is separate (Settings → Closed dates).</p>
    <form id="pgForm" novalidate data-need="admin">
      <div class="row" style="align-items:flex-end">
        <label for="pg-date" style="width:auto">Date<input id="pg-date" type="date"></label>
        <label for="pg-title" style="min-width:0;flex:1">Title <span class="hint">Punjabi / English</span><input id="pg-title" maxlength="120" placeholder="ਗੁਰਪੁਰਬ ਸ੍ਰੀ ਗੁਰੂ ਗੋਬਿੰਦ ਸਿੰਘ ਜੀ / Gurpurab"></label>
      </div>
      <label for="pg-note">Details <span class="hint">optional: times, kirtan, langar</span><textarea id="pg-note" rows="3" maxlength="600"></textarea></label>
      <fieldset class="checks"><legend>Seva the sangat can sign up for</legend><div id="pgSevas"></div>
        <label for="pg-other" style="margin-top:6px">Other seva <span class="hint">optional, one per line</span><textarea id="pg-other" rows="2" maxlength="300"></textarea></label></fieldset>
      <div id="pgMsg"></div>
      <div class="row"><button class="btn" type="submit">Add programme</button></div>
    </form>
    <div id="pgList" style="margin-top:12px"></div>
  </div>

  <div class="panel" data-tab="users" data-need="admin" id="usersPanel">
    <h3>Committee users</h3>
    <p class="hint"><b>Sevadar</b>: bookings, payments received and receipts, rosters. <b>Khazanchi</b>: also payments made, refunds, voids, Excel and reports. <b>Pardhan / Admin</b>: everything, including settings and users. To add someone: enter their email here, then they open this page, choose "First time? Make your login", and confirm their email.</p>
    <form id="usForm" novalidate>
      <div class="row" style="align-items:flex-end">
        <label for="us-email" style="width:auto">Email<input id="us-email" type="email" autocomplete="off"></label>
        <label for="us-name" style="width:auto">Name<input id="us-name" maxlength="80" autocomplete="off"></label>
        <label for="us-role" style="width:auto">Role<select id="us-role"><option value="sevadar">Sevadar (office)</option><option value="treasurer">Khazanchi (treasurer)</option><option value="admin">Pardhan / Admin</option></select></label>
      </div>
      <div id="usMsg"></div>
      <div class="row"><button class="btn" type="submit">Invite</button></div>
    </form>
    <div id="usList" style="margin-top:12px"></div>
  </div>

  <div class="panel" data-tab="users" data-need="admin" id="logPanel">
    <h3>Activity log</h3>
    <p class="hint">Every receipt, void, refund, cancellation, payment and setting change, with who did it and when. Nobody can change or delete it.</p>
    <div class="row" style="align-items:flex-end">
      <label for="lg-who" style="width:auto">Who<select id="lg-who"><option value="">Everyone</option></select></label>
      <label for="lg-q" style="width:auto">Search<input id="lg-q" maxlength="40" placeholder="ref, action, receipt no."></label>
      <button class="btn ghost" type="button" id="lgXlsx">Download (Excel)</button>
    </div>
    <div id="lgList" class="loglist"></div>
  </div>

  <div class="panel" data-tab="users" data-need="admin" id="backupPanel">
    <h3>Backup</h3>
    <p class="hint">Every Sunday morning a backup of all records is emailed automatically: Excel-friendly files of bookings, receipts, payments made, Pathi Singhs, seva sign-ups and the activity log, plus a full copy for restoring. It has the sangat's phone numbers, so keep that email private. Needs the backup email keys in Netlify (see the setup notes).</p>
    <div id="bkMsg"></div>
    <div class="row"><button class="btn ghost" type="button" id="bkNow">Email a backup now</button></div>
  </div>`;
  area.insertAdjacentHTML('beforeend', panels);

  // ---------- Sections (tabs) ----------
  function showTab(t, save) {
    const btn = document.querySelector(`[data-tabbtn="${t}"]`);
    if (!btn || (btn.dataset.need && !can(btn.dataset.need))) t = 'bookings';
    if (save) tryLS('gpb-tab', t);
    document.querySelectorAll('[data-tabbtn]').forEach(b => b.setAttribute('aria-current', b.dataset.tabbtn === t ? 'page' : 'false'));
    area.querySelectorAll(':scope > .panel').forEach(p => { p.hidden = (p.dataset.tab || 'bookings') !== t; });
  }
  $('tabs').addEventListener('click', e => { const b = e.target.closest('[data-tabbtn]'); if (b) { showTab(b.dataset.tabbtn, true); window.scrollTo({ top: 0 }); } });
  showTab('bookings');

  // ---------- Helpers ----------
  const pathiList = () => Object.entries(S.pathis || {}).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const contactOf = ref => { const l = S.lookups[ref]; return l && S.contacts[l.slot]; };
  const failedFor = ref => Object.entries(S.notices || {}).filter(([, n]) => n.ref === ref).sort((a, b) => String(b[1].createdAt).localeCompare(String(a[1].createdAt)));
  const TPL = { path_booking_confirmed: 'Booking confirmed', path_bheta_received: 'Receipt', path_aarambh_reminder: 'Path reminder', path_payment_checking: 'Payment being checked',
    path_payment_not_found: 'Payment not found', path_date_changed: 'Date changed', path_booking_cancelled: 'Booking cancelled', path_receipt_void: 'Receipt void',
    path_refund_issued: 'Refund', path_advance_reminder: 'Payment reminder', pathi_raul_assigned: 'Roster to Pathi Singh', pathi_raul_reminder: 'Raul reminder' };
  const tplName = t => TPL[t] || TPL[String(t).replace(/_v\d+$/, '')] || t;
  const when = x => { const d = new Date(x && x.toDate ? x.toDate() : x); return isNaN(d) ? '' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); };
  const busyIn = el => el.contains(document.activeElement) && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
  const linkOf = id => `${location.origin}${location.pathname.replace(/[^/]*$/, '')}pathi.html?id=${id}`;
  const unavailableOn = (p, day) => (p.unavailable || []).includes(day);
  const pathiShare = (name, id, pin) => `ਵਾਹਿਗੁਰੂ ਜੀ ਕਾ ਖ਼ਾਲਸਾ, ਵਾਹਿਗੁਰੂ ਜੀ ਕੀ ਫ਼ਤਹਿ ${name} ਜੀ।\nਆਪ ਜੀ ਦੀ ਰੌਲ ਸੂਚੀ ਅਤੇ ਭੇਟਾ ਇਸ ਲਿੰਕ 'ਤੇ ਵੇਖੋ ਜੀ:\n${linkOf(id)}\nPIN: ${pin}\n(Your raul roster and bheta: open the link and enter the PIN. Please keep the PIN private.)`;

  // ---------- On each booking: warnings, buttons, roster ----------
  X.warn = b => {
    if (!b.ref) return '';
    const f = failedFor(b.ref).slice(0, 2), c = b.c;
    return f.map(([k, n]) => `<div class="warn">⚠️ WhatsApp not delivered: <b>${esc(tplName(n.template))}</b> (${when(n.statusAt || n.createdAt)}). ${esc(String(n.error || '').slice(0, 140))}.
      Please call${c && c.phone ? ` <b>${esc(c.phone)}</b>` : ' the family'}. <button class="linkbtn" data-resend="${esc(k)}">Send again</button></div>`).join('');
  };
  X.actions = b => {
    const l = b.l, ref = b.ref, out = [];
    if (!ref || !l) return out;
    const open = !l.closed;
    if (open && (l.type === 'akhand' || l.type === 'sehaj')) {
      const ro = S.rosters[ref], n = ro ? ro.rauls.filter(x => x.pathiId).length : 0;
      out.push(`<button class="linkbtn" data-roster="${esc(ref)}">${ro ? `Roster (${n}/${ro.rauls.length})` : 'Make roster'}</button>`);
    }
    if (open && b.a.due && b.c && b.c.phone) out.push(`<button class="linkbtn" data-advance="${esc(ref)}">Payment reminder (WhatsApp)</button>`);
    const rec = (l.receipts || []).map((x, i) => ['path', i, x]).concat((l.sevaReceipts || []).map((x, i) => ['seva', i, x])).filter(([, , x]) => !x.void)
      .sort((x, y) => String(y[2].date).localeCompare(String(x[2].date)));
    if (rec.length && b.c && b.c.phone) out.push(`<button class="linkbtn" data-rcagain="${esc(ref)}|${rec[0][0]}|${rec[0][1] + 1}">Send receipt ${esc(rec[0][2].no)} again</button>`);
    if (API.demo && b.c) out.push(`<button class="linkbtn" data-demofail="${esc(ref)}">Demo: fail a message</button>`);
    return out;
  };
  // Roster editor (inside the booking)
  function draftOf(b) {
    const ref = b.ref;
    if (!S.draft[ref]) {
      const ro = S.rosters[ref], s = S.settings || {};
      if (ro) S.draft[ref] = JSON.parse(JSON.stringify({ time: ro.time, hours: ro.hours, place: ro.place, note: ro.note, rauls: ro.rauls }));
      else if (b.type === 'akhand') { const time = G.akhandTimeOf(s), hours = G.raulHoursOf(s); S.draft[ref] = { time, hours, place: s.name || '', note: '', rauls: G.makeRauls(b.start, time, hours) }; }
      else S.draft[ref] = { time: '', hours: 0, place: s.name || '', note: '', rauls: [1, 2].map(() => ({ from: '', to: '', label: 'Bhog', pathiId: '', name: '' })) };
    }
    return S.draft[ref];
  }
  // Same Pathi Singh already on another path at an overlapping time?
  function clash(ref, x) {
    if (!x.pathiId) return '';
    for (const [r2, ro] of Object.entries(S.rosters)) {
      if (r2 === ref) continue;
      const l2 = S.lookups[r2]; if (l2 && l2.closed) continue;
      for (const y of ro.rauls || []) if (y.pathiId === x.pathiId) {
        const dayX = x.from ? x.from.slice(0, 10) : S.lookups[ref].start;
        const hit = x.from && y.from ? (x.from < y.to && y.from < x.to) : y.from ? y.from.slice(0, 10) === dayX : ro.start === dayX;
        if (hit) return `also on ${r2}`;
      }
    }
    return '';
  }
  X.below = b => {
    const ref = b.ref;
    if (!ref || !S.rosterOpen[ref]) return '';
    const d = draftOf(b), t = G.typeOf(b.type), akh = b.type === 'akhand', pl = pathiList().filter(([, p]) => p.active !== false);
    const AV = { yes: ' ✓', no: ' (not available)', mismatch: '' };
    const avTag = (p, x, day) => { const a = G.availFor(p, ref, x, day); return a === 'mismatch' ? ` (${(p.avail || {})[ref]} only)` : AV[a] || ''; };
    const opts = (x, day) => `<option value="">—</option>` + pl.map(([id, p]) => `<option value="${id}"${id === x.pathiId ? ' selected' : ''}>${esc(p.name)}${avTag(p, x, day)}</option>`).join('');
    const rows = d.rauls.map((x, i) => { const day = x.from ? x.from.slice(0, 10) : b.start, p = x.pathiId && S.pathis[x.pathiId], c = clash(ref, x), a = p ? G.availFor(p, ref, x, day) : '';
      return `<tr><td>${i + 1}</td><td>${x.from ? esc(G.raulText(x)) : esc(x.label || 'Bhog')}</td>
        <td><select data-rp="${i}" aria-label="Pathi Singh for raul ${i + 1}">${opts(x, day)}</select>${a === 'no' ? ' <span class="warnc">not available</span>' : a === 'mismatch' ? ` <span class="warnc">said ${esc((p.avail || {})[ref])} only</span>` : ''}${c ? ` <span class="warnc">${esc(c)}</span>` : ''}</td></tr>`; }).join('');
    // Who has told us about this path
    const told = pl.map(([id, p]) => [p, (p.avail || {})[ref], unavailableOn(p, b.start)]).filter(([, a, u]) => a || u);
    const availLine = `<div class="meta availline"><b>Availability for this path:</b> ${told.length ? told.map(([p, a, u]) => `${esc(p.name)}: ${u && !a ? 'not available that day' : esc(G.AVAIL[a][1])}`).join(' · ') : 'no Pathi Singh has told us yet (they choose on their own page).'}</div>`;
    const filled = d.rauls.filter(x => x.pathiId).length;
    // Paying the Pathi Singhs from the roster (Khazanchi / Pardhan)
    let pay = '';
    const saved = S.rosters[ref];
    if (can('treasurer') && saved) {
      const counts = {}; saved.rauls.forEach(x => { if (x.pathiId) counts[x.pathiId] = (counts[x.pathiId] || 0) + 1; });
      const s = S.settings || {};
      pay = Object.keys(counts).length ? `<h5>Bheta to Pathi Singhs</h5>` +
        Object.entries(counts).map(([pid, n]) => {
          const p = S.pathis[pid] || { name: '?' }, paid = Object.entries(S.expenses || {}).filter(([, e]) => e.ref === ref && e.pathiId === pid && !e.void);
          const amt = akh ? n * (s.raulBheta || 0) : (s.sehajBheta || 0);
          return `<div class="payrow"><b>${esc(p.name)}</b>${akh ? ` <span class="hint">${n} raul${n === 1 ? '' : 's'}</span>` : ''}${paid.length
            ? `<span>Paid: ${paid.map(([id, e]) => `<a href="receipt.html?exp=${id}" target="_blank" rel="noopener">${esc(e.no)}</a> ${M$(e.amount)}`).join(', ')}</span>`
            : `<span class="row" style="gap:8px"><input name="amt_${pid}" type="number" min="1" step="1" inputmode="numeric" value="${amt || ''}" style="width:100px" aria-label="Amount in rupees for ${esc(p.name)}">
               <select name="mode_${pid}" style="width:auto" aria-label="Paid by"><option>Cash</option><option>UPI</option><option>Bank transfer</option><option>Cheque</option></select>
               <button class="btn" type="button" data-paypathi="${esc(ref)}|${pid}|${n}">Pay and make voucher</button></span>`}</div>`;
        }).join('') : '';
    }
    return `<form class="rosterForm" data-ref="${esc(ref)}" novalidate>
      <h4>Roster · ${t ? t.en : ''} · ${esc(b.name)} parivar</h4>
      ${akh ? `<div class="row" style="align-items:flex-end">
        <label style="width:auto">Starts at<input name="time" type="time" value="${esc(d.time)}" style="width:130px"></label>
        <label style="width:auto">One raul<select name="hours">${[1, 1.5, 2, 3, 4].map(h => `<option value="${h}"${h === Number(d.hours) ? ' selected' : ''}>${h} hour${h === 1 ? '' : 's'}</option>`).join('')}</select></label>
        <button class="btn ghost" type="button" data-rgen="${esc(ref)}">Make rauls again with these times</button></div>
        <p class="hint">Making rauls again clears the names. ${d.rauls.length} rauls over 48 hours.</p>` : `<p class="hint">Sehaj Path bhog: choose the Pathi Singhs for the bhog. <button class="linkbtn" type="button" data-raddrow="${esc(ref)}">Add one more</button></p>`}
      <label>Place<input name="place" maxlength="150" value="${esc(d.place)}"></label>
      ${availLine}
      ${akh && pl.length ? `<div class="fillturn"><span class="hint">Fill empty rauls in turn with:</span> ${pl.map(([id, p]) => { const a = (p.avail || {})[ref];
          return `<label class="chk"><input type="checkbox" name="turn" value="${id}"${a && a !== 'no' ? ' checked' : ''}> ${esc(p.name)}${a ? ` <span class="hint">(${esc(G.AVAIL[a][1])})</span>` : ''}</label>`; }).join('')}
        <button class="btn ghost" type="button" data-rfill="${esc(ref)}">Fill in turn</button></div>` : ''}
      ${pl.length ? '' : '<div class="warn">No Pathi Singhs added yet. Add them in the Pathi Singhs section first.</div>'}
      <div class="tablewrap"><table class="rtable"><tr><th>#</th><th>${akh ? 'Time' : ''}</th><th>Pathi Singh</th></tr>${rows}</table></div>
      <label>Note for Pathi Singhs <span class="hint">optional</span><input name="note" maxlength="300" value="${esc(d.note || '')}"></label>
      <div class="rmsg"></div>
      <div class="row"><button class="btn" type="submit">Save roster (${filled}/${d.rauls.length})</button>
        ${saved ? `<a class="btn ghost" href="receipt.html?roster=${esc(ref)}" target="_blank" rel="noopener">Print roster</a>
        <button class="btn ghost" type="button" data-rsend="${esc(ref)}">Send to Pathi Singhs (WhatsApp)</button>` : ''}
        <button class="btn ghost" type="button" data-rclose="${esc(ref)}">Close</button></div>
      ${saved ? `<div class="hint">Saved ${when(saved.updatedAt)}${saved.by ? ' by ' + esc(saved.by) : ''}. Each Pathi Singh also sees it on their own page.</div>` : ''}
      ${pay}</form>`;
  };

  const list = $('list');
  list.addEventListener('change', e => {
    const fm = e.target.closest('.rosterForm'); if (!fm) return;
    const d = S.draft[fm.dataset.ref]; if (!d) return;
    const el = e.target;
    if (el.dataset.rp !== undefined) { const x = d.rauls[Number(el.dataset.rp)], p = S.pathis[el.value]; x.pathiId = el.value; x.name = p ? p.name : ''; }
    else if (['time', 'hours', 'place', 'note'].includes(el.name)) d[el.name] = el.name === 'hours' ? Number(el.value) : el.value;
  });
  const msgIn = (fm, cls, html) => { const m = fm.querySelector('.rmsg') || fm; note(m, cls, html); };
  list.addEventListener('click', async e => {
    const at = a => e.target.closest(`[${a}]`), v = (el, a) => el.getAttribute(a);
    let el;
    if ((el = at('data-roster'))) { S.rosterOpen[v(el, 'data-roster')] = true; renderList(); return; }
    if ((el = at('data-rclose'))) { const r = v(el, 'data-rclose'); delete S.rosterOpen[r]; delete S.draft[r]; renderList(); return; }
    if ((el = at('data-rgen'))) { const r = v(el, 'data-rgen'), d = S.draft[r], l = S.lookups[r];
      if (el.dataset.armed !== '1' && d.rauls.some(x => x.pathiId)) { el.dataset.armed = '1'; el.textContent = 'Tap again: this clears the names'; return; }
      d.rauls = G.makeRauls(l.start, d.time || '08:00', Number(d.hours) || 2); renderList(); return; }
    if ((el = at('data-raddrow'))) { const d = S.draft[v(el, 'data-raddrow')]; if (d.rauls.length < 8) d.rauls.push({ from: '', to: '', label: 'Bhog', pathiId: '', name: '' }); renderList(); return; }
    if ((el = at('data-rfill'))) { const fm = el.closest('form'), r = v(el, 'data-rfill'), d = S.draft[r];
      const pick = [...fm.querySelectorAll('input[name=turn]:checked')].map(x => x.value);
      if (!pick.length) return msgIn(fm, 'err', 'Tick the Pathi Singhs to fill in turn.');
      let k = 0; d.rauls.forEach(x => { if (x.pathiId) return;
        // skip a Pathi Singh who marked that day not available
        // skip a Pathi Singh who is not available then (that day, or day/night only)
        for (let tries = 0; tries < pick.length; tries++) { const id = pick[k++ % pick.length], p = S.pathis[id], a = G.availFor(p, r, x, x.from.slice(0, 10));
          if (a !== 'no' && a !== 'mismatch') { x.pathiId = id; x.name = p.name; break; } } });
      renderList(); return; }
    if ((el = at('data-rsend'))) { const r = v(el, 'data-rsend'), fm = el.closest('form'); el.disabled = true;
      try { const j = await API.callFn('committee', { action: 'roster', ref: r });
        const sent = (j.results || []).filter(x => x.sent).length, same = (j.results || []).filter(x => x.skipped).length, bad = (j.results || []).filter(x => x.error);
        msgIn(fm, bad.length ? 'err' : 'good', API.demo ? 'Demo mode: no WhatsApp is sent.' : `Sent to ${sent} Pathi Singh${sent === 1 ? '' : 's'}.${same ? ` ${same} already had this same roster.` : ''}${bad.length ? ` ${bad.length} could not be sent (no phone, or WhatsApp problem).` : ''}`); }
      catch (x) { msgIn(fm, 'err', fnError(x)); }
      el.disabled = false; return; }
    if ((el = at('data-paypathi'))) { const [r, pid, n] = v(el, 'data-paypathi').split('|'), fm = el.closest('form'), l = S.lookups[r], p = S.pathis[pid];
      const amount = Math.round(Number(fm.querySelector(`[name="amt_${pid}"]`).value) || 0), method = fm.querySelector(`[name="mode_${pid}"]`).value;
      if (!(amount >= 1)) return fm.querySelector(`[name="amt_${pid}"]`).focus();
      el.disabled = true;
      try { await API.addExpense({ category: 'Pathi Singh bheta', name: p.name, pathiId: pid, amount, method, ref: r, pathType: l.type, pathDate: l.start,
        note: l.type === 'akhand' ? `${n} raul${n === '1' ? '' : 's'}` : 'Sehaj Path bhog' }); }
      catch (x) { el.disabled = false; el.textContent = 'Could not save. Retry'; }
      return; }
    if ((el = at('data-advance'))) { const r = v(el, 'data-advance'); el.disabled = true; el.textContent = 'Sending…';
      try { await API.callFn('committee', { action: 'advance', ref: r }); el.textContent = API.demo ? 'Demo: not sent' : 'Reminder sent ✓'; }
      catch (x) { el.disabled = false; el.textContent = x && x.status === 409 ? 'Nothing due' : 'Could not send. Retry'; }
      return; }
    if ((el = at('data-rcagain'))) { const [r, kind, n] = v(el, 'data-rcagain').split('|'); el.disabled = true; el.textContent = 'Sending…';
      try { await API.callFn('committee', { action: 'receipt', ref: r, kind, n: Number(n) }); el.textContent = API.demo ? 'Demo: not sent' : 'Receipt sent again ✓'; }
      catch (x) { el.disabled = false; el.textContent = 'Could not send. Retry'; }
      return; }
    if ((el = at('data-demofail'))) { API.demoFailNotice(v(el, 'data-demofail')); return; }
  });
  list.addEventListener('submit', async e => {
    const fm = e.target; if (!fm.classList.contains('rosterForm')) return; e.preventDefault();
    const r = fm.dataset.ref, l = S.lookups[r], d = S.draft[r], btn = fm.querySelector('[type=submit]');
    btn.disabled = true;
    try { await API.saveRoster({ ref: r, type: l.type, start: l.start, name: l.name, place: d.place, time: d.time, hours: d.hours, note: d.note, rauls: d.rauls });
      document.activeElement.blur(); delete S.draft[r]; renderList();
      const f2 = list.querySelector(`.rosterForm[data-ref="${r}"]`); if (f2) msgIn(f2, 'good', 'Roster saved. Use "Send to Pathi Singhs" to tell them on WhatsApp.'); }
    catch (x) { btn.disabled = false; msgIn(fm, 'err', 'Could not save the roster. Check your internet connection, and that the latest Firebase rules are published.'); }
  });
  // "Send again" for a failed WhatsApp (on a booking or in the WhatsApp section)
  async function resend(el) {
    el.disabled = true; el.textContent = 'Sending…';
    try { await API.callFn('committee', { action: 'resend', key: el.dataset.resend }); el.textContent = API.demo ? 'Demo: not sent' : 'Sent again ✓'; }
    catch (x) { el.disabled = false; el.textContent = 'Could not send. Retry'; }
  }
  document.addEventListener('click', e => { const el = e.target.closest('[data-resend]'); if (el) resend(el); });

  // ---------- Pathi Singhs ----------
  function renderPathis() {
    const box = $('paList'); if (busyIn($('pathiPanel'))) return;
    const pl = pathiList(), fy = G.finYear();
    if (!pl.length) { box.innerHTML = '<p class="hint">No Pathi Singhs added yet.</p>'; return; }
    box.innerHTML = pl.map(([id, p]) => {
      const up = Object.values(S.rosters).filter(r => r.start >= G.add(G.today, -2) && (r.pathiIds || []).includes(id) && !(S.lookups[r.ref] || {}).closed);
      const rauls = up.reduce((n, r) => n + r.rauls.filter(x => x.pathiId === id).length, 0);
      const paid = Object.values(S.expenses || {}).filter(e => e.pathiId === id && !e.void && String(e.no).includes('/' + fy + '/')).reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const na = (p.unavailable || []).filter(d => d >= G.today);
      return `<div class="bitem${p.active === false ? ' off' : ''}"><div class="bmain"><div class="who">${esc(p.name)}${p.active === false ? ' <span class="hint">(switched off)</span>' : ''}</div>
        <div class="meta">${esc(p.phone || 'no phone')}${p.note ? ' · ' + esc(p.note) : ''}</div>
        <div class="meta">${up.length ? `Upcoming: ${up.length} path${up.length === 1 ? '' : 's'}, ${rauls} raul${rauls === 1 ? '' : 's'}` : 'No upcoming rauls'}${can('treasurer') ? ` · Bheta paid this year: ${M$(paid)}` : ''}</div>
        ${p.usual ? `<div class="meta">Usually: ${esc(p.usual)}</div>` : ''}
        ${Object.entries(p.avail || {}).filter(([r]) => S.lookups[r] && !S.lookups[r].closed && S.lookups[r].start >= G.today).length ? `<div class="meta">Offered: ${Object.entries(p.avail).filter(([r]) => S.lookups[r] && !S.lookups[r].closed && S.lookups[r].start >= G.today)
          .map(([r, a]) => `${G.fmtShort(S.lookups[r].start)} ${esc((G.typeOf(S.lookups[r].type) || {}).en || '')} (${esc(G.AVAIL[a][1])})`).join(', ')}</div>` : ''}
        ${na.length ? `<div class="meta">Not available: ${na.slice(0, 12).map(d => G.fmtShort(d)).join(', ')}${na.length > 12 ? '…' : ''}</div>` : ''}
        ${can('treasurer') ? `<div class="row" style="gap:12px"><button class="linkbtn" data-newpin="${id}">New PIN and link</button>
          <button class="linkbtn" data-paoff="${id}">${p.active === false ? 'Switch on' : 'Switch off'}</button></div>` : ''}</div></div>`;
    }).join('');
  }
  function showPin(id, name, phone, pin) {
    const text = pathiShare(name, id, pin), wa = phone ? G.waLink(phone, text) : '';
    $('pinBox').innerHTML = `<div class="note good"><b>${esc(name)}</b>: link and PIN. The PIN is shown only now: send it to them.
      <pre class="share">${esc(text)}</pre><div class="row"><button class="btn ghost" type="button" id="pinCopy">Copy message</button>${wa ? `<a class="btn ghost" href="${wa}" target="_blank" rel="noopener">Send on WhatsApp</a>` : ''}</div></div>`;
    $('pinCopy').onclick = async () => { try { await navigator.clipboard.writeText(text); $('pinCopy').textContent = 'Copied ✓'; } catch (x) { $('pinCopy').textContent = 'Select the text and copy'; } };
  }
  $('paForm').onsubmit = async e => {
    e.preventDefault(); const name = $('pa-name').value.trim(), phone = $('pa-phone').value.trim().replace(/\s+/g, ' ');
    if (name.length < 2) return note($('paMsg'), 'err', 'Enter the name.');
    if (phone && !/^[0-9+ \-]{7,20}$/.test(phone)) return note($('paMsg'), 'err', 'The phone number is not valid.');
    if (Object.values(S.pathis).some(p => p.name.trim().toLowerCase() === name.toLowerCase())) return note($('paMsg'), 'err', 'A Pathi Singh with this name is already listed. Add something to tell them apart.');
    const btn = $('paForm').querySelector('[type=submit]'); btn.disabled = true;
    try { const { id, pin } = await API.addPathi({ name, phone, note: $('pa-note').value.trim() });
      $('paMsg').innerHTML = ''; ['pa-name', 'pa-phone', 'pa-note'].forEach(i => { $(i).value = ''; }); document.activeElement.blur(); showPin(id, name, phone, pin); }
    catch (x) { note($('paMsg'), 'err', 'Could not save. Check your internet connection, and that the latest Firebase rules are published.'); }
    btn.disabled = false;
  };
  $('paList').addEventListener('click', async e => {
    const np = e.target.closest('[data-newpin]'), off = e.target.closest('[data-paoff]');
    if (np) { const id = np.dataset.newpin, p = S.pathis[id];
      if (np.dataset.armed !== '1') { np.dataset.armed = '1'; np.textContent = 'Tap again: the old PIN stops working'; return; }
      np.disabled = true; try { showPin(id, p.name, p.phone, await API.resetPin(id, p.name)); } catch (x) { np.textContent = 'Could not save. Retry'; np.disabled = false; } }
    if (off) { const id = off.dataset.paoff, p = S.pathis[id]; off.disabled = true;
      try { await API.updatePathi(id, { active: p.active === false, name: p.name }); } catch (x) { off.disabled = false; off.textContent = 'Could not save. Retry'; } }
  });

  // ---------- WhatsApp section ----------
  function renderWa() {
    const all = Object.entries(S.notices || {}).sort((a, b) => String(b[1].statusAt || b[1].createdAt).localeCompare(String(a[1].statusAt || a[1].createdAt)));
    $('waCount').hidden = !all.length; $('waCount').textContent = all.length;
    if (busyIn($('waPanel'))) return;
    $('waList').innerHTML = all.length ? all.slice(0, 50).map(([k, n]) => {
      const l = S.lookups[n.ref], c = n.ref && contactOf(n.ref), p = n.pathiId && S.pathis[n.pathiId];
      const phone = p ? p.phone : c ? c.phone : '';
      return `<div class="bitem"><div class="bmain"><div class="who">${esc(tplName(n.template))}${p ? ' · ' + esc(p.name) : l ? ' · ' + esc(l.name) + ' parivar' : ''}</div>
        <div class="meta">${n.ref ? 'Ref ' + esc(n.ref) + ' · ' : ''}${when(n.statusAt || n.createdAt)}${phone ? ` · 📞 <b>${esc(phone)}</b>` : ''}</div>
        <div class="meta">${esc(String(n.error || 'Not delivered').slice(0, 200))}</div>
        <div class="row" style="gap:12px"><button class="linkbtn" data-resend="${esc(k)}">Send again</button></div></div></div>`;
    }).join('') : '<p class="hint">All messages delivered, nothing to do. 🙏</p>';
  }

  // ---------- Monthly report ----------
  const thisMonth = G.today.slice(0, 7);
  $('mr-month').value = thisMonth; $('mr-month').max = G.add(G.today, 31).slice(0, 7);
  function renderReport() {
    if (!can('treasurer')) return;
    const m = $('mr-month').value || thisMonth, o = G.monthData(S, m);
    $('mrSummary').innerHTML = `${o.paths.length} path${o.paths.length === 1 ? '' : 's'} with bhog this month · Received ${M$(o.received)} · Refunds ${M$(o.refunds)} · Paid out ${M$(o.expTotal)} · <b>Balance ${M$(o.net)}</b>`;
  }
  $('mr-month').addEventListener('change', renderReport);
  $('mrOpen').onclick = () => window.open(`report.html?m=${encodeURIComponent($('mr-month').value || thisMonth)}`, '_blank');
  $('mrXlsx').onclick = () => {
    if (typeof XLSX === 'undefined') { $('mrSummary').textContent = 'The Excel tool did not load. Reload the page.'; return; }
    const m = $('mr-month').value || thisMonth, o = G.monthData(S, m), wb = XLSX.utils.book_new();
    const sum = [['Paths with bhog this month', o.paths.length], ...Object.entries(o.byType).map(([k, n]) => ['  ' + ((G.typeOf(k) || {}).en || k), n]),
      ['Bookings cancelled this month', o.cancelled], ['Path bheta received online (Rs)', o.online], ['Path bheta received at gurdwara (Rs)', o.office],
      ['Seva bheta with paths (Rs)', o.seva], ['Seva bheta without booking (Rs)', o.sevaOnly], ['Total received (Rs)', o.received], ['Refunds (Rs)', o.refunds],
      ...Object.entries(o.expenses).map(([k, v]) => ['Paid: ' + k + ' (Rs)', v]), ['Total paid out (Rs)', o.expTotal], ['Balance (Rs)', o.net]].map(([Item, Value]) => ({ Item, Value }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sum), 'Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(o.paths.length ? o.paths.map(x => ({ 'Bhog date': x.bhog, Path: (G.typeOf(x.l.type) || {}).en || x.l.type, Family: x.l.name, Reference: x.ref,
      'Bheta (Rs)': x.a.total, 'Paid (Rs)': x.a.paid, 'Balance (Rs)': x.a.due, Status: (G.STATES[x.a.state] || ['', x.a.state])[1], 'Pathi Singhs': x.pathis.join(', ') })) : [{ 'Bhog date': 'None' }]), 'Paths');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(o.receipts.length ? o.receipts.map(r => ({ 'Receipt no.': r.no, Type: r.kind, Date: new Date(r.date).toLocaleDateString('en-IN'), Reference: r.ref, Name: r.name,
      'Amount (Rs)': r.kind === 'Refund' ? -r.amount : r.amount, Mode: r.method, 'Issued by': r.by || '', Status: r.void ? 'VOID' : 'Valid' })) : [{ 'Receipt no.': 'None' }]), 'Receipts');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(o.vouchers.length ? o.vouchers.map(e => ({ 'Voucher no.': e.no, Date: new Date(e.date).toLocaleDateString('en-IN'), Type: e.category, 'Paid to': e.name,
      Reference: e.ref || '', 'Amount (Rs)': e.amount, Mode: e.method, Note: e.note || '', 'Made by': e.by || '', Status: e.void ? 'VOID' : 'Valid' })) : [{ 'Voucher no.': 'None' }]), 'Expenses');
    try { XLSX.writeFile(wb, `month-${m}.xlsx`); } catch (x) { $('mrSummary').textContent = 'Could not create the file. Try again.'; }
  };

  // ---------- Programmes and seva sign-ups ----------
  $('pgSevas').innerHTML = G.SIGNUP_SEVAS.map((x, i) => `<label class="chk"><input type="checkbox" name="pgs" value="${esc(x)}"${i < 2 ? ' checked' : ''}> ${esc(x)}</label>`).join('');
  $('pg-date').min = G.today;
  function renderProgs() {
    if (busyIn($('progPanel'))) return;
    const s = S.settings || {}, progs = (s.programmes || []).slice().sort((a, b) => a.date < b.date ? -1 : 1);
    const up = progs.filter(p => p.date >= G.add(G.today, -7)), old = progs.filter(p => p.date < G.add(G.today, -7)).slice(-3);
    const sign = Object.entries(S.signups || {});
    $('pgList').innerHTML = (up.length || old.length) ? [...up, ...old].map(p => {
      const mine = sign.filter(([, g]) => g.prog === p.id).sort((a, b) => a[1].seva.localeCompare(b[1].seva));
      const byS = {}; mine.forEach(([, g]) => { byS[g.seva] = (byS[g.seva] || 0) + 1; });
      return `<div class="bitem"><div class="bdate">${G.fmtShort(p.date)}<small>${G.fmtDow(p.date)}</small></div><div class="bmain"><div class="who">${esc(p.title)}</div>
        ${p.note ? `<div class="meta">${esc(p.note)}</div>` : ''}
        <div class="meta">Seva: ${p.sevas.map(esc).join(' · ') || '—'}</div>
        <details${mine.length && p.date >= G.today ? ' open' : ''}><summary>${mine.length} sign-up${mine.length === 1 ? '' : 's'}${Object.keys(byS).length ? ': ' + Object.entries(byS).map(([k, n]) => `${esc(k.split(' / ')[1] || k)} ${n}`).join(', ') : ''}</summary>
          ${mine.map(([id, g]) => `<div class="meta">${esc(g.name)} · <b>${esc(g.phone)}</b> · ${esc(g.seva)}${g.note ? ' · ' + esc(g.note) : ''} <button class="linkbtn" data-sgdel="${id}">Remove</button></div>`).join('') || '<div class="hint">No names yet.</div>'}
          ${mine.length ? `<button class="linkbtn" data-sgxls="${esc(p.id)}">Download list (Excel)</button>` : ''}</details>
        ${can('admin') ? `<button class="linkbtn danger-text" data-pgdel="${esc(p.id)}">Remove programme</button>` : ''}</div></div>`;
    }).join('') : '<p class="hint">No programmes added yet.</p>';
  }
  $('pgForm').onsubmit = async e => {
    e.preventDefault(); const date = $('pg-date').value, title = $('pg-title').value.trim();
    if (!date || date < G.today) return note($('pgMsg'), 'err', 'Choose a date from today onwards.');
    if (title.length < 3) return note($('pgMsg'), 'err', 'Enter a title.');
    const sevas = [...document.querySelectorAll('input[name=pgs]:checked')].map(x => x.value).concat($('pg-other').value.split('\n').map(x => x.trim()).filter(Boolean)).slice(0, 10);
    const id = 'p' + Date.now().toString(36);
    try { await API.saveSettings({ ...S.settings, programmes: [...(S.settings.programmes || []), { id, date, title, note: $('pg-note').value.trim(), sevas }] });
      ['pg-date', 'pg-title', 'pg-note', 'pg-other'].forEach(i => { $(i).value = ''; }); document.activeElement.blur(); note($('pgMsg'), 'good', 'Added. It now shows on the booking page.'); renderProgs(); }
    catch (x) { note($('pgMsg'), 'err', 'Could not save. Check your internet connection.'); }
  };
  $('pgList').addEventListener('click', async e => {
    const del = e.target.closest('[data-pgdel]'), sd = e.target.closest('[data-sgdel]'), sx = e.target.closest('[data-sgxls]');
    if (del) { if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Tap again to remove'; return; }
      try { await API.saveSettings({ ...S.settings, programmes: (S.settings.programmes || []).filter(p => p.id !== del.dataset.pgdel) }); } catch (x) { del.textContent = 'Could not save. Retry'; } }
    if (sd) { if (sd.dataset.armed !== '1') { sd.dataset.armed = '1'; sd.textContent = 'Tap again'; return; }
      const g = S.signups[sd.dataset.sgdel]; try { await API.deleteSignup(sd.dataset.sgdel, g && g.name); } catch (x) { sd.textContent = 'Could not remove'; } }
    if (sx && typeof XLSX !== 'undefined') { const p = (S.settings.programmes || []).find(x => x.id === sx.dataset.sgxls);
      const rows = Object.values(S.signups).filter(g => g.prog === sx.dataset.sgxls).map(g => ({ Seva: g.seva, Name: g.name, Phone: g.phone, Note: g.note || '' }));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Seva sign-ups'); XLSX.writeFile(wb, `seva-${p ? p.date : 'programme'}.xlsx`); }
  });

  // ---------- Users ----------
  function renderUsers() {
    if (!can('admin') || busyIn($('usersPanel'))) return;
    const me = API.me() || {}, { staff, invites } = S.staffData;
    const rows = Object.entries(staff).sort((a, b) => String(a[1].name).localeCompare(String(b[1].name))).map(([uid, u]) => `<div class="bitem${u.active ? '' : ' off'}"><div class="bmain">
      <div class="who">${esc(u.name || u.email)}${u.active ? '' : ' <span class="hint">(switched off)</span>'}</div><div class="meta">${esc(u.email)} · ${esc((G.ROLES[u.role] || ['', u.role])[1])}</div>
      ${uid === me.uid ? '<div class="hint">This is you.</div>' : `<div class="row" style="gap:10px"><select data-urole="${uid}" aria-label="Role for ${esc(u.name)}">${Object.entries(G.ROLES).map(([k, v]) => `<option value="${k}"${k === u.role ? ' selected' : ''}>${v[1]}</option>`).join('')}</select>
        <button class="linkbtn" data-uoff="${uid}">${u.active ? 'Switch off' : 'Switch on'}</button></div>`}</div></div>`).join('');
    const inv = Object.entries(invites).map(([em, i]) => `<div class="bitem"><div class="bmain"><div class="who">${esc(i.name)} <span class="hint">(invited, not signed up yet)</span></div>
      <div class="meta">${esc(em)} · ${esc((G.ROLES[i.role] || ['', i.role])[1])}</div><button class="linkbtn" data-uinvdel="${esc(em)}">Remove invite</button></div></div>`).join('');
    $('usList').innerHTML = `<div class="hint">The first committee login (set up in Firebase) is always Pardhan / Admin.</div>` + (rows + inv || '<p class="hint">No other users yet.</p>');
  }
  $('usForm').onsubmit = async e => {
    e.preventDefault(); const em = $('us-email').value.trim().toLowerCase(), name = $('us-name').value.trim(), role = $('us-role').value;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return note($('usMsg'), 'err', 'Enter their email address.');
    if (name.length < 2) return note($('usMsg'), 'err', 'Enter their name.');
    try { await API.invite(em, name, role); ['us-email', 'us-name'].forEach(i => { $(i).value = ''; }); document.activeElement.blur();
      note($('usMsg'), 'good', `Invited. Ask ${esc(name)} to open <b>${esc(location.origin + location.pathname)}</b>, choose "First time? Make your login" with <b>${esc(em)}</b>, and confirm the email Firebase sends.`); }
    catch (x) { note($('usMsg'), 'err', 'Could not save. Check that the latest Firebase rules are published.'); }
  };
  $('usList').addEventListener('change', async e => { const s = e.target.closest('[data-urole]'); if (!s) return;
    const uid = s.dataset.urole, u = S.staffData.staff[uid]; try { await API.setStaff(uid, { role: s.value }, u.name); } catch (x) { note($('usMsg'), 'err', 'Could not change the role.'); } });
  $('usList').addEventListener('click', async e => {
    const off = e.target.closest('[data-uoff]'), di = e.target.closest('[data-uinvdel]');
    if (off) { const uid = off.dataset.uoff, u = S.staffData.staff[uid]; off.disabled = true; try { await API.setStaff(uid, { active: !u.active }, u.name); } catch (x) { off.disabled = false; } }
    if (di) { di.disabled = true; try { await API.cancelInvite(di.dataset.uinvdel); } catch (x) { di.disabled = false; } }
  });

  // ---------- Activity log ----------
  function logRows() {
    const who = $('lg-who').value, q = $('lg-q').value.trim().toLowerCase();
    return S.log.filter(([, x]) => (!who || x.by === who) && (!q || `${x.action} ${x.ref} ${x.detail} ${x.name} ${x.email}`.toLowerCase().includes(q)));
  }
  function renderLog() {
    if (!can('admin')) return;
    const people = {}; S.log.forEach(([, x]) => { people[x.by] = x.name || x.email; });
    if (!busyIn($('logPanel'))) { const cur = $('lg-who').value;
      $('lg-who').innerHTML = '<option value="">Everyone</option>' + Object.entries(people).map(([k, v]) => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(v)}</option>`).join(''); }
    const rows = logRows();
    $('lgList').innerHTML = rows.length ? `<div class="tablewrap"><table class="rtable"><tr><th>When</th><th>Who</th><th>What</th><th>Ref</th><th>Details</th></tr>${rows.slice(0, 200).map(([, x]) =>
      `<tr><td>${when(x.at)}</td><td>${esc(x.name || x.email)}<div class="hint">${esc((G.ROLES[x.role] || ['', x.role])[1])}</div></td><td>${esc(x.action)}</td><td>${esc(x.ref || '')}</td><td>${esc(x.detail || '')}</td></tr>`).join('')}</table></div>`
      : '<p class="hint">Nothing recorded yet.</p>';
  }
  ['lg-who', 'lg-q'].forEach(i => $(i).addEventListener('input', renderLog));
  $('lgXlsx').onclick = () => { if (typeof XLSX === 'undefined') return;
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(logRows().map(([, x]) => ({ When: new Date(x.at).toLocaleString('en-IN'), Who: x.name || x.email,
      Role: (G.ROLES[x.role] || ['', x.role])[1], Action: x.action, Reference: x.ref || '', Details: x.detail || '' }))), 'Activity log'); XLSX.writeFile(wb, `activity-log-${G.today}.xlsx`); };

  // ---------- Backup ----------
  $('bkNow').onclick = async () => { const b = $('bkNow'); b.disabled = true; b.textContent = 'Sending…';
    try { const j = await API.callFn('committee', { action: 'backup' }); note($('bkMsg'), 'good', API.demo ? 'Demo mode: no email is sent.' : `Backup emailed (${esc(j.summary || '')}). Check the inbox.`); }
    catch (x) { note($('bkMsg'), 'err', fnError(x)); }
    b.disabled = false; b.textContent = 'Email a backup now'; };

  // ---------- Wiring ----------
  X.onData = () => { renderPathis(); renderWa(); renderReport(); renderProgs(); };
  X.onSettings = () => { renderProgs(); };
  X.onSignIn = () => {
    showTab(tryLS('gpb-tab') || 'bookings');
    if (can('admin')) { API.watchStaff(d => { S.staffData = d; renderUsers(); }); API.watchLog(rows => { S.log = rows; renderLog(); }); }
  };
})();
