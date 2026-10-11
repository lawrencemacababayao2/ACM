import { createHash } from 'node:crypto';
import { pool } from '../config/db.js';
import { HttpError } from '../lib/utils.js';

// An attempt that started but never finished (crash, power loss) is reclaimed
// after this long so the retry can actually re-run the work. Live in_progress
// rows are untouched and answered with 409.
const IN_PROGRESS_TTL_SECONDS = 60;
// Completed entries stop being replayed after this long. A fresh key is what a
// brand-new form submit uses, so a day is comfortably longer than any plausible
// retry window.
const EXPIRY_HOURS = 24;
// The sweep runs on a fraction of requests rather than on a timer, so the table
// stays bounded without an extra scheduler.
const CLEANUP_CHANCE = 0.05;

// `key` is a column name, so it is backticked everywhere it appears in SQL.
const CN = '`key`';

// A conservative shape for a client-generated key (crypto.randomUUID is a 36-char
// dash-hex string). Anything else is ignored and the request passes through, so a
// key supplied by a broken or non-cooperating client never blocks the work.
const KEY_PATTERN = /^[A-Za-z0-9_\-]{8,128}$/;

// The route is scoped per method + path so the same key cannot leak across
// endpoints, and each :id keeps its own row.
function routeFor(req) {
  return `${req.method} ${req.baseUrl}${req.path}`.replace(/\/+$/, '');
}

function hashBody(body) {
  return createHash('sha256').update(body == null ? '' : JSON.stringify(body)).digest('hex');
}

async function sweepExpired() {
  if (Math.random() > CLEANUP_CHANCE) return;
  try {
    await pool.query(`DELETE FROM idempotency_keys WHERE created_at < NOW() - INTERVAL ${EXPIRY_HOURS} HOUR`);
    await pool.query(
      `DELETE FROM idempotency_keys WHERE status = 'in_progress' AND updated_at < NOW() - INTERVAL ${IN_PROGRESS_TTL_SECONDS} SECOND`
    );
  } catch (err) {
    console.error('[idempotency] sweep failed:', err.message);
  }
}

// `fresh` is decided in SQL, so a stale in_progress row (left by a crash) can be
// told apart from a live one without the application reasoning about the stored
// timestamp format.
async function findRow(key, userId, route) {
  const [rows] = await pool.query(
    `SELECT id, status, request_hash, status_code, response_body,
            (updated_at > NOW() - INTERVAL ${IN_PROGRESS_TTL_SECONDS} SECOND) AS fresh
       FROM idempotency_keys
      WHERE ${CN} = ? AND user_id = ? AND route = ?`,
    [key, userId, route]
  );
  return rows[0] || null;
}

async function insertAttempt(key, userId, route, requestHash) {
  const [result] = await pool.query(
    `INSERT IGNORE INTO idempotency_keys (${CN}, user_id, route, request_hash, status)
     VALUES (?, ?, ?, ?, 'in_progress')`,
    [key, userId, route, requestHash]
  );
  return result.affectedRows === 1;
}

// installs AFTER the auth middleware that fills in req.user. It is safe to mount
// on a whole router or a single route: without a well-formed key it is a no-op.
export function idempotent() {
  return async (req, res, next) => {
    if (req.method !== 'POST' && req.method !== 'PUT') return next();
    const key = typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'].trim() : '';
    if (!KEY_PATTERN.test(key)) return next();
    if (!req.user?.id) return next();

    const route = routeFor(req);
    const requestHash = hashBody(req.body);
    await sweepExpired();

    try {
      const existing = await findRow(key, req.user.id, route);

      if (existing) {
        // A finished attempt may only be replayed with the identical body. The
        // same key carrying different input is a client bug, so it is refused
        // rather than silently running a second, different operation.
        if (existing.status === 'completed') {
          if (existing.request_hash !== requestHash) {
            throw new HttpError(422, 'Idempotency-Key was already used with a different request');
          }
          let body = null;
          try { body = existing.response_body == null ? null : JSON.parse(existing.response_body); } catch { body = null; }
          res.status(existing.status_code || 200).setHeader('Content-Type', 'application/json');
          res.send(body == null ? 'null' : JSON.stringify(body));
          return;
        }
        // in_progress
        if (Number(existing.fresh) === 1) {
          if (existing.request_hash !== requestHash) {
            throw new HttpError(422, 'Idempotency-Key is already being used with a different request');
          }
          throw new HttpError(409, 'Request is already in progress');
        }
        // Stale in_progress: the earlier attempt died mid-request (crash, power
        // loss). Reclaim the key so the retry re-runs the work instead of
        // returning a forever-409.
        await pool.query('DELETE FROM idempotency_keys WHERE id = ?', [existing.id]);
      }

      const owns = await insertAttempt(key, req.user.id, route, requestHash);
      if (!owns) {
        // The insert lost the race: a concurrent request with the same key is in
        // flight, so this one refuses to run a duplicate. Its row is left alone.
        throw new HttpError(409, 'Request is already in progress');
      }

      // We own the attempt. Capture the success body so a retry can replay it
      // verbatim; on any failure (validation, auth, server error) the row is
      // released so the "Try again" path actually re-runs the handler.
      let sent = false;
      let body = null;
      const original = res.json.bind(res);
      res.json = (value) => {
        sent = true;
        body = value;
        return original(value);
      };
      res.once('finish', () => {
        const ok = res.statusCode >= 200 && res.statusCode < 400;
        const query = ok && sent
          ? 'UPDATE idempotency_keys SET status = \'completed\', status_code = ?, response_body = ? WHERE ' + CN + ' = ? AND user_id = ? AND route = ?'
          : `DELETE FROM idempotency_keys WHERE ${CN} = ? AND user_id = ? AND route = ?`;
        const params = ok && sent
          ? [res.statusCode, JSON.stringify(body), key, req.user.id, route]
          : [key, req.user.id, route];
        pool.query(query, params).catch((err) => console.error('[idempotency] finalise failed:', err.message));
      });

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

export default idempotent;