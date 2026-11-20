// Shared server code for the WhatsApp functions.
// Reads the booking database with the Firebase service account (server access, so the
// Firestore security rules do not apply here) and sends WhatsApp template messages
// through Meta's WhatsApp Cloud API.
//
// Settings (Netlify → Site configuration → Environment variables):
//   FIREBASE_SERVICE_ACCOUNT  the whole JSON key file from Firebase (Project settings → Service accounts)
//   FIRESTORE_DATABASE        your database name, "default" for this project
//   WA_TOKEN                  WhatsApp access token from Meta
//   WA_PHONE_ID               "Phone number ID" from Meta (not the phone number itself)
//   WA_TEST_TO                while testing: every message goes ONLY to this number (e.g. 919996056369).
//                             Remove it when you go live, so messages go to each devotee.
//   SITE_URL                  e.g. https://babajeonsinghpathbooking.netlify.app
//   WA_LANG                   template language code, default "en"
//   WA_API_VERSION            Graph API version, default "v21.0"
import crypto from 'node:crypto';

const env = k => (process.env[k] || '').trim();

// ---------- Google access token from the service account ----------
let tokenCache = null;
function serviceAccount() {
  const raw = env('FIREBASE_SERVICE_ACCOUNT');
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
  return JSON.parse(raw);
}
const b64url = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
async function googleToken() {
  if (tokenCache && tokenCache.exp > Date.now() + 60e3) return tokenCache.token;
  const sa = serviceAccount(), now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = crypto.createSign('RSA-SHA256').update(head + '.' + claim).sign(sa.private_key);
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claim + '.' + b64url(sig) }) });
  const j = await res.json();
  if (!j.access_token) throw new Error('Google sign-in failed: ' + JSON.stringify(j));
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tokenCache.token;
}

// ---------- Firestore REST ----------
const base = () => `https://firestore.googleapis.com/v1/projects/${serviceAccount().project_id}/databases/${env('FIRESTORE_DATABASE') || '(default)'}/documents`;
function fromValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  return null;
}
const fromFields = f => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, fromValue(v)]));
function toValue(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'number') return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (x instanceof Date) return { timestampValue: x.toISOString() };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(toValue) } };
  if (typeof x === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, toValue(v)])) } };
  return { stringValue: String(x) };
}
export async function getDoc(path) {
  const r = await fetch(`${base()}/${path}`, { headers: { Authorization: 'Bearer ' + await googleToken() } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Firestore read ${path}: ${r.status} ${await r.text()}`);
  return fromFields((await r.json()).fields);
}
// Creates a document only if it does not exist yet. Returns false if it already existed.
export async function createOnce(path, data) {
  const r = await fetch(`${base()}/${path}?currentDocument.exists=false`, { method: 'PATCH',
    headers: { Authorization: 'Bearer ' + await googleToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toValue(v)])) }) });
  if (r.ok) return true;
  const t = await r.text();
  if (r.status === 409 || /ALREADY_EXISTS|FAILED_PRECONDITION/.test(t)) return false;
  throw new Error(`Firestore write ${path}: ${r.status} ${t}`);
}
export async function updateDoc(path, data) {
  const mask = Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const r = await fetch(`${base()}/${path}?${mask}`, { method: 'PATCH',
    headers: { Authorization: 'Bearer ' + await googleToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toValue(v)])) }) });
  if (!r.ok) throw new Error(`Firestore update ${path}: ${r.status} ${await r.text()}`);
}
export async function deleteDoc(path) {
  const r = await fetch(`${base()}/${path}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + await googleToken() } });
  if (!r.ok && r.status !== 404) throw new Error(`Firestore delete ${path}: ${r.status} ${await r.text()}`);
}
export async function queryEq(collection, filters) {
  const r = await fetch(`${base()}:runQuery`, { method: 'POST',
    headers: { Authorization: 'Bearer ' + await googleToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }],
      where: { compositeFilter: { op: 'AND', filters: Object.entries(filters).map(([f, v]) => ({ fieldFilter: { field: { fieldPath: f }, op: 'EQUAL', value: toValue(v) } })) } } } }) });
  if (!r.ok) throw new Error(`Firestore query: ${r.status} ${await r.text()}`);
  return (await r.json()).filter(x => x.document).map(x => ({ id: x.document.name.split('/').pop(), data: fromFields(x.document.fields) }));
}

// ---------- Booking helpers (same rules as the website) ----------
// Path names are sent in Punjabi and English, e.g. "ਅਖੰਡ ਪਾਠ ਸਾਹਿਬ / Akhand Path Sahib".
export const TYPES = { akhand: { en: 'ਅਖੰਡ ਪਾਠ ਸਾਹਿਬ / Akhand Path Sahib', days: 2 }, sehaj: { en: 'ਸਹਿਜ ਪਾਠ ਦਾ ਭੋਗ / Sehaj Path Bhog', days: 1 },
  'sukh-am': { en: 'ਸੁਖਮਨੀ ਸਾਹਿਬ / Sukhmani Sahib (7:00 AM)', days: 1 }, 'sukh-pm': { en: 'ਸੁਖਮਨੀ ਸਾਹਿਬ / Sukhmani Sahib (5:00 PM)', days: 1 } };
export const money = n => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
export const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fmt = s => new Date(s + 'T12:00:00Z').toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
export const istToday = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
export const istTomorrow = () => addDays(istToday(), 1);
export function whenText(type, start) {
  const t = TYPES[type];
  return t && t.days > 1 ? `${fmt(start)} (bhog ${fmt(addDays(start, 2))})` : fmt(start);
}
export function account(l) {
  const total = Number(l.total) || 0, disc = Number(l.discount) || 0;
  const online = Number(l.paidOnline) || 0, cash = Number(l.paidCash) || 0, paid = Math.max(0, online + cash - (Number(l.refunded) || 0));
  const target = cash > 0 ? total : Math.max(0, total - disc);
  const due = Math.max(0, target - paid), advance = Math.ceil(total * 0.2);
  return { total, disc, online, cash, paid, due, advance };
}
// Hours an unpaid booking is held (committee setting, default 48; 0 = never released).
export const holdHours = s => { const n = Number(s && s.holdHours); return Number.isFinite(n) && n >= 0 && n <= 168 ? Math.round(n) : 48; };
export function statusText(l, s) {
  const a = account(l);
  if (!a.total) return 'no bheta amount set, please ask at the gurdwara office';
  if (!a.due) return `paid in full (${money(a.paid)})`;
  if (!a.paid) {
    const h = s ? holdHours(s) : 0;
    return `advance of ${money(a.advance)} (20%) needed` + (h ? ` within ${h} hours of booking ji, otherwise the booking is cancelled automatically and you will need to book again` : '') +
      `. Total ${money(a.total)}, or ${money(Math.max(0, a.total - a.disc))} if paid fully online`;
  }
  return `${money(a.paid)} received, balance ${money(a.due)} due before the bhog`;
}
export const siteUrl = () => (env('SITE_URL') || env('URL') || '').replace(/\/+$/, '');

// ---------- WhatsApp Cloud API ----------
export function toNumber(phone) {
  const test = env('WA_TEST_TO').replace(/\D/g, '');
  if (test) return test.length === 10 ? '91' + test : test;
  let d = String(phone || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '0') d = d.slice(1);
  if (d.length === 10) d = '91' + d;
  return d;
}
export async function sendTemplate(to, name, params, lang) {
  const token = env('WA_TOKEN'), id = env('WA_PHONE_ID');
  if (!token || !id) throw new Error('WA_TOKEN or WA_PHONE_ID is not set');
  const body = { messaging_product: 'whatsapp', to, type: 'template',
    template: { name, language: { code: lang || env('WA_LANG') || 'en' },
      components: params && params.length ? [{ type: 'body', parameters: params.map(t => ({ type: 'text', text: String(t).replace(/\s+/g, ' ').slice(0, 900) })) }] : [] } };
  const r = await fetch(`https://graph.facebook.com/${env('WA_API_VERSION') || 'v21.0'}/${id}/messages`, { method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('WhatsApp: ' + JSON.stringify(j.error || j));
  return j.messages && j.messages[0] && j.messages[0].id;
}

// Sends one message at most once. notices/{key} remembers what was sent.
export async function sendOnce(key, to, template, params, info) {
  const claimed = await createOnce(`notices/${key}`, { template, to, createdAt: new Date(), status: 'sending', ...(info || {}) });
  if (!claimed) return { key, skipped: true };
  try {
    const id = await sendTemplate(to, template, params);
    await updateDoc(`notices/${key}`, { status: 'sent', messageId: id || '' });
    return { key, sent: true };
  } catch (e) {
    await updateDoc(`notices/${key}`, { status: 'failed', error: String(e.message || e).slice(0, 500) }).catch(() => {});
    return { key, error: String(e.message || e) };
  }
}

export const TEMPLATES = {
  booked: env('WA_TPL_BOOKED') || 'path_booking_confirmed',
  payment: env('WA_TPL_PAYMENT') || 'path_bheta_received',
  reminder: env('WA_TPL_REMINDER') || 'path_aarambh_reminder',
  checking: env('WA_TPL_CHECKING') || 'path_payment_checking',
  notfound: env('WA_TPL_NOTFOUND') || 'path_payment_not_found',
  moved: env('WA_TPL_MOVED') || 'path_date_changed',
  cancelled: env('WA_TPL_CANCELLED') || 'path_booking_cancelled',
  void: env('WA_TPL_VOID') || 'path_receipt_void',
  refund: env('WA_TPL_REFUND') || 'path_refund_issued'
};
// Punjabi + English wording for the reasons the committee picks (the committee page stores the English).
const REASONS = {
  'Devotee asked to cancel': 'ਆਪ ਜੀ ਦੀ ਬੇਨਤੀ ਅਨੁਸਾਰ / As you requested',
  'No advance received': 'ਸਮੇਂ ਸਿਰ ਅਗਾਊਂ ਭੇਟਾ ਨਹੀਂ ਮਿਲੀ / Advance not received in time',
  'Date not available (gurdwara programme)': 'ਇਸ ਮਿਤੀ ਨੂੰ ਗੁਰਦੁਆਰਾ ਸਾਹਿਬ ਦਾ ਪ੍ਰੋਗਰਾਮ ਹੈ / Gurdwara Sahib programme on this date',
  'Duplicate booking': 'ਦੋਹਰੀ ਬੁਕਿੰਗ / Duplicate booking',
  'Entered by mistake': 'ਗ਼ਲਤੀ ਨਾਲ ਦਰਜ ਹੋਈ / Entered by mistake',
  'Wrong amount': 'ਗ਼ਲਤ ਰਕਮ / Wrong amount',
  'Payment not received in bank': 'ਰਕਮ ਬੈਂਕ ਵਿੱਚ ਨਹੀਂ ਮਿਲੀ / Payment not found in bank',
  'Duplicate receipt': 'ਦੋਹਰੀ ਰਸੀਦ / Duplicate receipt',
  'Wrong family or booking': 'ਗ਼ਲਤ ਪਰਿਵਾਰ ਜਾਂ ਬੁਕਿੰਗ / Wrong family or booking',
  'Booking cancelled': 'ਬੁਕਿੰਗ ਰੱਦ ਹੋਈ / Booking cancelled',
  'Paid twice': 'ਦੋ ਵਾਰ ਭੁਗਤਾਨ / Paid twice',
  'Paid too much': 'ਵੱਧ ਰਕਮ ਭੇਜੀ / Paid too much',
  'Gurdwara cancelled the programme': 'ਗੁਰਦੁਆਰਾ ਸਾਹਿਬ ਵੱਲੋਂ ਪ੍ਰੋਗਰਾਮ ਰੱਦ / Programme cancelled by Gurdwara Sahib',
  'Other': 'ਹੋਰ ਕਾਰਨ, ਕਿਰਪਾ ਕਰਕੇ ਦਫ਼ਤਰ ਨਾਲ ਸੰਪਰਕ ਕਰੋ ਜੀ / Other, kindly contact the office'
};
export const reasonText = r => REASONS[r] || String(r || 'ਦਫ਼ਤਰ ਨਾਲ ਸੰਪਰਕ ਕਰੋ ਜੀ / Kindly contact the office');
export const AUTO_CANCEL_REASON = 'ਸਮੇਂ ਸਿਰ ਅਗਾਊਂ ਭੇਟਾ ਨਹੀਂ ਮਿਲੀ, ਤਾਂ ਜੋ ਮਿਤੀ ਹੋਰ ਸੰਗਤ ਲਈ ਖੁੱਲ੍ਹੀ ਰਹੇ / Advance not received within 48 hours, so the date is kept open for other sangat';
// The "booking cancelled" message (used by notify and by the hourly release).
export const cancelParams = (l, ref, reason, url) => [l.name, (TYPES[l.type] || { en: l.type }).en, whenText(l.type, l.start), ref, reason, url || 'the gurdwara booking page'];
