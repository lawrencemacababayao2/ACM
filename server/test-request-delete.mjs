// End-to-end checks for DELETE /api/requests/:id (rejected-only delete). The
// router is mounted on its own scratch Express app on an ephemeral port, so the
// live :3001 server is never touched, and fixtures are removed on the way out.
import express from 'express';
import { pool } from './src/config/db.js';
import { sign } from './src/middleware/auth.js';
import requestsRouter from './src/routes/requests.js';

let passed = 0;
const failures = [];
const check = (name, ok, detail = '') => {
  if (ok) { passed += 1; return; }
  failures.push(`${name}${detail ? ' :: ' + detail : ''}`);
};
const eq = (name, actual, expected) =>
  check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

const app = express();
app.use(express.json());
app.use('/requests', requestsRouter);
const srv = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const BASE = `http://127.0.0.1:${srv.address().port}/requests`;

async function call(path, { method = 'DELETE', token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    signal: AbortSignal.timeout(15000),
    headers: token ? { Authorization: 'Bearer ' + token } : {},
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-json */ }
  return { status: res.status, json, text };
}

const [admins] = await pool.query(
  "SELECT id, token_version FROM users WHERE role IN ('admin','super_admin') AND is_active = 1 ORDER BY id LIMIT 1"
);
check('admin fixture exists', admins.length === 1, JSON.stringify(admins));
const adminToken = sign({ id: admins[0].id, tv: admins[0].token_version ?? 0 });

const [bens] = await pool.query('SELECT id FROM beneficiaries ORDER BY id LIMIT 1');
check('beneficiary fixture exists', bens.length === 1, JSON.stringify(bens));
const benId = bens[0].id;

const [rejectedIns] = await pool.query(
  "INSERT INTO requests (beneficiary_id, type, subject, status) VALUES (?, 'service', 'ZZDeleteTest-rejected', 'rejected')",
  [benId]
);
const rejectedId = rejectedIns.insertId;
await pool.query(
  "INSERT INTO request_status_log (request_id, status, note) VALUES (?, 'rejected', 'fixture')",
  [rejectedId]
);
await pool.query(
  "INSERT INTO notifications (message, notification_type, request_id) VALUES ('ZZDeleteTest', 'request_status', ?)",
  [rejectedId]
);

const [pendingIns] = await pool.query(
  "INSERT INTO requests (beneficiary_id, type, subject, status) VALUES (?, 'service', 'ZZDeleteTest-pending', 'pending')",
  [benId]
);
const pendingId = pendingIns.insertId;

try {
  const noAuth = await call(`/${rejectedId}`);
  eq('delete without token is 401', noAuth.status, 401);

  const [benUsers] = await pool.query(
    "SELECT id, token_version FROM users WHERE role = 'beneficiary' ORDER BY id LIMIT 1"
  );
  if (benUsers.length) {
    const benToken = sign({ id: benUsers[0].id, tv: benUsers[0].token_version ?? 0 });
    const forbidden = await call(`/${rejectedId}`, { token: benToken });
    eq('delete as beneficiary is 403', forbidden.status, 403);
  }

  const missing = await call('/999999999', { token: adminToken });
  eq('delete missing id is 404', missing.status, 404);

  const notNumeric = await call('/abc', { token: adminToken });
  eq('delete non-numeric id is 404', notNumeric.status, 404);

  const guarded = await call(`/${pendingId}`, { token: adminToken });
  eq('delete pending request is 400', guarded.status, 400);
  check('guard message names the rule', String(guarded.text).includes('rejected'), guarded.text.slice(0, 160));
  const [stillPending] = await pool.query('SELECT status FROM requests WHERE id = ?', [pendingId]);
  eq('pending request untouched', stillPending.length, 1);

  const deleted = await call(`/${rejectedId}`, { token: adminToken });
  eq('delete rejected request is 200', deleted.status, 200);
  eq('delete responds ok', deleted.json?.ok, true);

  const [reqGone] = await pool.query('SELECT id FROM requests WHERE id = ?', [rejectedId]);
  eq('request row removed', reqGone.length, 0);
  const [logGone] = await pool.query('SELECT COUNT(*) n FROM request_status_log WHERE request_id = ?', [rejectedId]);
  eq('status history cascaded', logGone[0].n, 0);
  const [notifGone] = await pool.query('SELECT COUNT(*) n FROM notifications WHERE request_id = ?', [rejectedId]);
  eq('notifications cascaded', notifGone[0].n, 0);

  const repeat = await call(`/${rejectedId}`, { token: adminToken });
  eq('deleting twice is 404', repeat.status, 404);
} finally {
  await pool.query("DELETE FROM requests WHERE subject LIKE 'ZZDeleteTest%'");
  await pool.query("DELETE FROM notifications WHERE message = 'ZZDeleteTest'");
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  FAIL: ${f}`);
}
process.exitCode = failures.length ? 1 : 0;

// Shut every handle down and let the process end naturally: a forced
// process.exit with the listener/pool still open trips a libuv close assert
// on Windows.
srv.closeAllConnections?.();
await new Promise((resolve) => srv.close(resolve));
await pool.end();
