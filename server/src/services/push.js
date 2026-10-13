import { pool } from '../config/db.js';
import { normalizeTargetTypes, concreteTargets } from '../lib/targetTypes.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Beneficiaries can turn push off in Profile (PATCH /me/preferences). NULL is
// treated as on so rows written before the column existed keep receiving push.
const PUSH_ENABLED = '(u.push_notifications IS NULL OR u.push_notifications = 1)';

// Builds the Expo message list, choosing the Cebuano copy for users whose token
// was registered while their app was in bis.
function messagesFor(rows, { subject, subjectBis, message, messageBis, data }) {
  return rows.map(({ token, lang }) => {
    const bis = lang === 'bis';
    return {
      to: token,
      title: bis ? subjectBis || subject : subject,
      body: bis ? messageBis || message : message,
      sound: 'default',
      data: data || {},
    };
  });
}

// Expo accepts up to 100 messages per request; chunk and count the accepted ones.
async function sendBatches(messages) {
  if (!messages.length) return 0;
  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(messages.slice(i, i + 100)),
      });
      const data = await res.json().catch(() => null);
      sent += Array.isArray(data?.data) ? data.data.filter((m) => m.status === 'ok').length : 0;
    } catch (e) {
      console.log('[push] send batch failed:', e.message);
    }
  }
  return sent;
}

// Sends an Expo push to every verified beneficiary matching any of the target
// types that has registered a device token and has not disabled push. An
// empty/absent target list means everyone. Both `beneficiary_type` and the
// legacy `category` are consulted, for the same reason as in services/sms.js: a
// beneficiary registered under the newer column still carries the old ENUM's
// 'farmer' default.
export async function sendPush({ subject, subjectBis, message, messageBis, categories, category }) {
  const targets = concreteTargets(normalizeTargetTypes(categories ?? category));
  const params = ['verified'];
  let where = 'b.status = ?';
  if (targets.length) {
    const placeholders = targets.map(() => '?').join(', ');
    where += ` AND (b.beneficiary_type IN (${placeholders}) OR b.category IN (${placeholders}))`;
    params.push(...targets, ...targets);
  }
  const [rows] = await pool.query(
    `SELECT pt.token, pt.lang
     FROM push_tokens pt
     JOIN users u ON u.id = pt.user_id
     JOIN beneficiaries b ON b.user_id = u.id
     WHERE ${where} AND ${PUSH_ENABLED}`,
    params
  );
  return sendBatches(messagesFor(rows, { subject, subjectBis, message, messageBis, data: { screen: 'inbox' } }));
}

// Pushes to a single beneficiary (used for request-status updates). Honours the
// user's push_notifications preference. Returns how many devices were accepted.
export async function sendPushToBeneficiary(beneficiaryId, { subject, subjectBis, message, messageBis, data }) {
  if (!beneficiaryId) return 0;
  const [rows] = await pool.query(
    `SELECT pt.token, pt.lang
     FROM push_tokens pt
     JOIN users u ON u.id = pt.user_id
     JOIN beneficiaries b ON b.user_id = u.id
     WHERE b.id = ? AND ${PUSH_ENABLED}`,
    [beneficiaryId]
  );
  return sendBatches(messagesFor(rows, { subject, subjectBis, message, messageBis, data: data || { screen: 'inbox' } }));
}
