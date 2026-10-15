import { pool } from '../config/db.js';
import { normalizeTargetTypes, concreteTargets } from '../lib/targetTypes.js';
import { sendPushToBeneficiary } from './push.js';

// Must stay in sync with the notifications.notification_type ENUM in schema.sql.
const NOTIFICATION_TYPES = new Set(['announcement', 'program', 'training', 'request_status']);

// Provider-agnostic SMS adapter (Semaphore-compatible JSON gateway).
// Without credentials it runs in LOG mode: messages are stored in the
// notifications table and printed to the console, so the whole flow works
// in a demo. Set SMS_API_KEY and SMS_GATEWAY_URL in .env to go live.

// iProg SMS expects the destination as a national-international number: 639XXXXXXXXX
function toIprogPhone(raw = '') {
  let p = String(raw).replace(/[^0-9+]/g, '');
  if (p.startsWith('+63')) return p.slice(1);
  if (p.startsWith('0')) return '63' + p.slice(1);
  return p;
}

// notificationType / announcementId / requestId tag the row so the mobile Inbox
// can merge content notifications and request-status updates in one list and
// deep-link each row to the right detail screen.
async function sendOne({ phone, beneficiaryId, subject = '', subjectBis, message, messageBis, notificationType = 'announcement', announcementId = null, requestId = null, smsLang = 'en' }) {
  const cleaned = String(phone || '').replace(/[^0-9+]/g, '');
  const apiKey = process.env.SMS_API_KEY || '';
  const gatewayUrl = process.env.SMS_GATEWAY_URL || '';
  const live = Boolean(apiKey && gatewayUrl && cleaned);
  const notifType = NOTIFICATION_TYPES.has(notificationType) ? notificationType : 'announcement';

  // Which stored copy actually goes out over SMS. English by default; callers
  // that want the Cebuano text delivered (request status updates) pass
  // smsLang: 'bis'. Both copies are always stored on the notification row so the
  // app Inbox can still render either language.
  const smsBody = smsLang === 'bis' && messageBis ? messageBis : message;

  const [result] = await pool.execute(
    `INSERT INTO notifications (beneficiary_id, phone, type, subject, subject_bis, message, message_bis, status, notification_type, announcement_id, request_id)
     VALUES (?, ?, 'sms', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [beneficiaryId || null, cleaned || null, subject, subjectBis || null, message, messageBis || null, live ? 'sent' : 'log', notifType, announcementId, requestId]
  );
  const id = result.insertId;

  // Request-status updates also fire a device push (respecting the user's
  // push_notifications preference) so a decision reaches the beneficiary even
  // when the app is closed. Broadcasts push separately in their own routes, so
  // this is limited to request_status to avoid double-sending.
  if (notifType === 'request_status' && beneficiaryId) {
    try {
      await sendPushToBeneficiary(beneficiaryId, {
        subject,
        subjectBis,
        message,
        messageBis,
        data: { screen: 'inbox', kind: 'request_status', id, requestId: requestId || null },
      });
    } catch (e) {
      console.log('[push] request status push failed:', e?.message || e);
    }
  }

  if (!live) {
    console.log(`[SMS LOG] -> ${cleaned || '(no phone)'}: ${smsBody}`);
    return { ok: true, mode: 'log', id };
  }

  try {
    const res = await fetch(gatewayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_token: apiKey,
        phone_number: toIprogPhone(cleaned),
        message: smsBody,
        sms_provider: process.env.SMS_PROVIDER || 2,
      }),
    });
    const body = await res.text();
    const status = res.ok ? 'sent' : 'failed';
    if (!res.ok) {
      console.error(`[sms] gateway rejected message to ${cleaned || '(no phone)'}: HTTP ${res.status} ${body.slice(0, 240)}`);
    }
    await pool.execute(
      'UPDATE notifications SET status = ?, gateway_ref = ? WHERE id = ?',
      [status, body.slice(0, 240), id]
    );
    return { ok: res.ok, mode: 'gateway', id, body };
  } catch (err) {
    console.error(`[sms] gateway request failed for ${cleaned || '(no phone)'}:`, err?.message || err);
    await pool.execute("UPDATE notifications SET status = 'failed' WHERE id = ?", [id]);
    return { ok: false, mode: 'gateway', id, error: err.message };
  }
}

export async function sendToRecipients(recipients, { subject, subjectBis, message, messageBis, notificationType, announcementId, requestId }) {
  const results = [];
  for (const r of recipients) {
    results.push(await sendOne({ ...r, subject, subjectBis, message, messageBis, notificationType, announcementId, requestId }));
  }
  return results;
}

export { sendOne };

// Builds the SQL predicate for "verified beneficiaries in any of these types".
// An empty list means no restriction at all, which is what ['all'] normalises to.
//
// Two columns have to be consulted. `beneficiary_type` is the current one, but
// `category` is the older ENUM the registration flow used to write, and it is NOT
// NULL DEFAULT 'farmer' -- so a fisherfolk who registered after the rename still
// carries category='farmer'. Matching only `category` (which is what this used to
// do) therefore delivered every broadcast to exactly the wrong people; matching
// only `beneficiary_type` would miss rows that predate it. This mirrors the filter
// in routes/beneficiaries.js, which already had to check both.
function typePredicate(categories, column = '') {
  const list = normalizeTargetTypes(categories);
  const targets = concreteTargets(list);
  if (!targets.length) return { sql: '', params: [] };
  const col = column || '';
  const placeholders = targets.map(() => '?').join(', ');
  return {
    sql: ` AND (${col}beneficiary_type IN (${placeholders}) OR ${col}category IN (${placeholders}))`,
    params: [...targets, ...targets],
  };
}

export async function broadcastToVerified({ subject, subjectBis, message, messageBis, categories, category, notificationType, announcementId }) {
  const { sql: typeSql, params: typeParams } = typePredicate(categories ?? category);
  const [rows] = await pool.query(
    `SELECT id AS beneficiaryId, contact_number AS phone FROM beneficiaries WHERE status = ?${typeSql}`,
    ['verified', ...typeParams]
  );
  return sendToRecipients(rows, { subject, subjectBis, message, messageBis, notificationType, announcementId });
}

// In-app notifications only (no SMS). Creates notification rows for verified
// beneficiaries matching the target types so published posts always appear
// in the mobile Inbox, even when send_sms is off.
export async function notifyVerifiedApp({ subject, subjectBis, message, messageBis, categories, category, notificationType = 'announcement', announcementId = null }) {
  const { sql: typeSql, params: typeParams } = typePredicate(categories ?? category);
  const [rows] = await pool.query(
    `SELECT id, contact_number AS phone FROM beneficiaries WHERE status = ?${typeSql}`,
    ['verified', ...typeParams]
  );
  const notifType = NOTIFICATION_TYPES.has(notificationType) ? notificationType : 'announcement';
  for (const r of rows) {
    await pool.execute(
      `INSERT INTO notifications (beneficiary_id, phone, type, subject, subject_bis, message, message_bis, status, notification_type, announcement_id)
       VALUES (?, ?, 'app', ?, ?, ?, ?, 'log', ?, ?)`,
      [r.id, r.phone || null, subject, subjectBis || null, message, messageBis || null, notifType, announcementId]
    );
  }
  return rows;
}

let creditsCache = null;
let creditsAt = 0;
const CREDITS_TTL_MS = 60_000;

export async function getSmsCredits() {
  const apiKey = process.env.SMS_API_KEY || '';
  const gatewayUrl = process.env.SMS_GATEWAY_URL || '';
  if (!apiKey || !gatewayUrl) return null;
  if (creditsCache !== null && Date.now() - creditsAt < CREDITS_TTL_MS) return creditsCache;
  try {
    const url = new URL('/api/v1/account/sms_credits', gatewayUrl);
    url.searchParams.set('api_token', apiKey);
    const res = await fetch(url);
    const body = await res.json();
    const value = parseFloat(body?.data?.load_balance);
    if (Number.isFinite(value)) {
      creditsCache = value;
      creditsAt = Date.now();
    }
    return creditsCache;
  } catch {
    return creditsCache;
  }
}