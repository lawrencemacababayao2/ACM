import { pool } from '../config/db.js';
import { normalizeTargetTypes, concreteTargets } from '../lib/targetTypes.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Sends an Expo push to every verified beneficiary matching any of the target
// types that has registered a device token. Title/body pick the user's language if
// we know it (set when the token was registered), falling back to English.
//
// An empty/absent target list means everyone. Both `beneficiary_type` and the
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
     WHERE ${where}`,
    params
  );
  if (!rows.length) return 0;

  const messages = rows.map(({ token, lang }) => {
    const bis = lang === 'bis';
    return {
      to: token,
      title: bis ? subjectBis || subject : subject,
      body: bis ? messageBis || message : message,
      sound: 'default',
      data: { screen: 'notifications' },
    };
  });

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