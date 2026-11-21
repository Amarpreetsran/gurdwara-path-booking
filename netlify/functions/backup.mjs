// Every Sunday at 7:00 AM India time (01:30 UTC): emails a backup of all records.
// Set BACKUP_EMAIL_TO, SMTP_USER and SMTP_PASS in Netlify first (see README). Does nothing until then.
import { runBackup } from '../lib/backup.mjs';

export default async () => {
  try {
    const r = await runBackup();
    console.log('Backup sent:', r.summary);
    return new Response(JSON.stringify(r), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('Backup failed:', e.message || e);
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { schedule: '30 1 * * 0' };
