// Weekly backup: reads every collection and emails it (Excel-friendly CSV files + a full copy).
// Netlify keys: BACKUP_EMAIL_TO, SMTP_USER (a Gmail address), SMTP_PASS (its 16-letter Gmail "app password").
// Optional: SMTP_HOST (default smtp.gmail.com), SMTP_PORT (default 465).
import tls from 'node:tls';
import zlib from 'node:zlib';
import { listAll, istToday } from './gpb.mjs';

const env = k => (process.env[k] || '').trim();
// The PIN hashes, invitations and message records are not needed in a backup.
const COLLECTIONS = ['settings', 'slots', 'contacts', 'lookup', 'reports', 'reschedules', 'counters', 'sevaonly', 'sevacontacts',
  'expenses', 'pathis', 'rosters', 'signups', 'staff', 'log'];

const cell = v => { const s = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = rows => {
  if (!rows.length) return '﻿No records\r\n';
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  return '﻿' + [cols.map(cell).join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\r\n') + '\r\n';
};
const day = d => d ? String(d).slice(0, 10) : '';

function tables(db) {
  const contacts = Object.fromEntries(db.contacts.map(x => [x.id, x.data]));
  const bookings = [], receipts = [];
  for (const { id: ref, data: l } of db.lookup) {
    const c = contacts[l.slot] || {};
    const valid = (l.receipts || []).filter(r => !r.void).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    bookings.push({ Reference: ref, Path: l.type, 'Path date': l.start, Family: l.name, Phone: c.phone || '', Note: c.note || '', 'Bheta (Rs)': l.total,
      'Paid online (Rs)': l.paidOnline || 0, 'Paid at gurdwara (Rs)': l.paidCash || 0, 'Refunded (Rs)': l.refunded || 0, 'Valid receipts (Rs)': valid, Status: l.closed || 'open' });
    const add = (r, kind) => receipts.push({ 'Receipt no.': r.no, Type: kind, Date: day(r.date), Reference: ref, Family: l.name, 'Amount (Rs)': kind === 'Refund' ? -r.amount : r.amount,
      Mode: r.method, UTR: r.utr || '', 'Issued by': r.by || '', Status: r.void ? 'VOID' : 'Valid', Reason: r.void ? r.void.reason : (r.reason || '') });
    (l.receipts || []).forEach(r => add(r, 'Path bheta')); (l.sevaReceipts || []).forEach(r => add(r, 'Seva bheta')); (l.refunds || []).forEach(r => add(r, 'Refund'));
  }
  for (const { id: ref, data: d } of db.sevaonly) if (d.receipt) {
    const r = d.receipt;
    receipts.push({ 'Receipt no.': r.no, Type: 'Seva (no booking)', Date: day(r.date), Reference: ref, Family: d.name, 'Amount (Rs)': r.amount, Mode: r.method, UTR: r.utr || '',
      'Issued by': r.by || '', Status: r.void ? 'VOID' : 'Valid', Reason: r.void ? r.void.reason : '' });
  }
  const expenses = db.expenses.map(({ data: e }) => ({ 'Voucher no.': e.no, Date: day(e.date), Type: e.category, 'Paid to': e.name, Reference: e.ref || '',
    'Amount (Rs)': e.amount, Mode: e.method, Note: e.note || '', 'Made by': e.by || '', Status: e.void ? 'VOID' : 'Valid' }));
  const pathis = db.pathis.map(({ data: p }) => ({ Name: p.name, Phone: p.phone || '', Note: p.note || '', Active: p.active === false ? 'No' : 'Yes', 'Not available': (p.unavailable || []).join(' ') }));
  const signups = db.signups.map(({ data: g }) => ({ Date: g.date, Programme: g.title, Seva: g.seva, Name: g.name, Phone: g.phone, Note: g.note || '' }));
  const log = db.log.map(({ data: x }) => ({ When: String(x.at || ''), Who: x.name || x.email || '', Role: x.role, Action: x.action, Reference: x.ref || '', Detail: x.detail || '' }))
    .sort((a, b) => a.When < b.When ? 1 : -1);
  return { bookings, receipts, expenses, pathis, signups, log };
}

// ---------- Minimal SMTP over TLS (Gmail) ----------
export function smtpSend({ host, port, user, pass, to, subject, text, attachments }) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host, port, servername: host, rejectUnauthorized: env('SMTP_INSECURE') !== '1' });
    let buf = '', waiting = null;
    const fail = e => { try { sock.destroy(); } catch (x) {} reject(e); };
    sock.setTimeout(20000, () => fail(new Error('SMTP timeout')));
    sock.on('error', fail);
    sock.on('data', d => {
      buf += d.toString('utf8');
      const lines = buf.split('\r\n'); if (lines.length < 2) return;
      const last = lines[lines.length - 2];
      if (/^\d{3} /.test(last)) { const w = waiting; waiting = null; const all = buf; buf = ''; w && w(all); }
    });
    const reply = () => new Promise(r => { waiting = r; });
    const step = async (cmd, code) => { if (cmd !== null) sock.write(cmd + '\r\n'); const r = await reply(); if (!r.split('\r\n').some(l => l.startsWith(String(code)))) throw new Error(`SMTP: ${cmd ? cmd.split(' ')[0] : 'greeting'} → ${r.trim().slice(0, 200)}`); return r; };
    const b64 = s => Buffer.from(s).toString('base64');
    const wrap = s => s.replace(/.{1,76}/g, '$&\r\n');
    const boundary = 'gpb' + Date.now().toString(36);
    const msg = [`From: ${user}`, `To: ${to.join(', ')}`, `Subject: =?UTF-8?B?${b64(subject)}?=`, `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${boundary}"`, '',
      `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap(b64(text)),
      ...attachments.flatMap(a => [`--${boundary}`, `Content-Type: ${a.type}; name="${a.name}"`, 'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${a.name}"`, '', wrap(Buffer.from(a.data).toString('base64'))]),
      `--${boundary}--`, ''].join('\r\n');
    (async () => {
      await step(null, 220);
      await step('EHLO gurdwara-booking', 250);
      await step('AUTH LOGIN', 334); await step(b64(user), 334); await step(b64(pass), 235);
      await step(`MAIL FROM:<${user}>`, 250);
      for (const t of to) await step(`RCPT TO:<${t}>`, 250);
      await step('DATA', 354);
      await step(msg + '\r\n.', 250);
      sock.write('QUIT\r\n'); sock.end();
      resolve(true);
    })().catch(fail);
  });
}

export async function runBackup() {
  const to = env('BACKUP_EMAIL_TO').split(/[,;\s]+/).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
  const user = env('SMTP_USER'), pass = env('SMTP_PASS').replace(/\s+/g, '');
  if (!to.length || !user || !pass) throw new Error('Backup email is not set up: add BACKUP_EMAIL_TO, SMTP_USER and SMTP_PASS in Netlify');
  const db = {};
  for (const c of COLLECTIONS) db[c] = await listAll(c);
  const t = tables(db), date = istToday();
  const full = zlib.gzipSync(Buffer.from(JSON.stringify({ date, collections: Object.fromEntries(COLLECTIONS.map(c => [c, Object.fromEntries(db[c].map(x => [x.id, x.data]))])) })));
  const summary = `${t.bookings.length} bookings, ${t.receipts.length} receipts, ${t.expenses.length} vouchers`;
  await smtpSend({ host: env('SMTP_HOST') || 'smtp.gmail.com', port: Number(env('SMTP_PORT')) || 465, user, pass, to,
    subject: `ਬੈਕਅੱਪ / Backup ${date}: path booking records`,
    text: `Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh.\n\nWeekly backup of the path booking records, ${date}.\n${summary}, ${t.pathis.length} Pathi Singhs, ${t.signups.length} seva sign-ups.\n\n` +
      `The .csv files open in Excel. The .json.gz file is a full copy of everything, kept for restoring if ever needed.\n` +
      `This email has phone numbers of the sangat: please keep it private and do not forward it.\n`,
    attachments: [
      ...Object.entries(t).map(([k, rows]) => ({ name: `${k}-${date}.csv`, type: 'text/csv; charset=UTF-8', data: csv(rows) })),
      { name: `full-backup-${date}.json.gz`, type: 'application/gzip', data: full }
    ] });
  return { summary, to: to.length };
}
