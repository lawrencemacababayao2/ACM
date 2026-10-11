// Confirms the request-completion hook is wired in and inert for the right reason:
// completing a request must still succeed and must not invent a report row.
import mysql from 'mysql2/promise';

const BASE = process.env.API_BASE || 'http://localhost:3001/api';
let passed = 0;
const failures = [];
const check = (name, ok, detail = '') => {
  if (ok) { passed += 1; return; }
  failures.push(`${name}${detail ? ' :: ' + detail : ''}`);
};

async function call(path, { method = 'GET', token, body } = {}) {
  // An AbortSignal bounds every call: completing a request fans out to the SMS
  // gateway, and a hanging outbound provider would otherwise stall the whole test.
  const res = await fetch(BASE + path, {
    method,
    signal: AbortSignal.timeout(15000),
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, json, text };
}

const login = await call('/auth/login', {
  method: 'POST', body: { email: 'admin@mao.gov.ph', password: 'admin123' },
});
const token = login.json?.token;
check('admin login', Boolean(token), login.text.slice(0, 120));

const conn = await mysql.createConnection({
  host: '127.0.0.1', user: 'root', password: '', database: 'acm',
});
const [beforeRows] = await conn.query('SELECT COUNT(*) n FROM animal_health_records');
const before = beforeRows[0].n;

const [reqs] = await conn.query('SELECT id, status FROM requests ORDER BY id');
const target = reqs[0];
check('a request exists to complete', Boolean(target), JSON.stringify(reqs));

// Completing a request must succeed even though the hook cannot build a record.
const done = await call(`/requests/${target.id}`, {
  method: 'PUT', token, body: { status: 'completed', admin_notes: 'Animal health hook test' },
});
check('completing a request still succeeds', done.status === 200, `status ${done.status}: ${done.text.slice(0, 200)}`);

const [afterRows] = await conn.query('SELECT COUNT(*) n FROM animal_health_records');
check('no report row was invented from a bare request',
  Number(afterRows[0].n) === Number(before),
  `before ${before}, after ${afterRows[0].n}`);

const [status] = await conn.query('SELECT status FROM requests WHERE id = ?', [target.id]);
check('the status really was persisted', status[0]?.status === 'completed', status[0]?.status);

// The hook must report why it did nothing, and that reason must name the missing
// columns rather than failing silently.
const { hasAnimalHealthRequestFields } = await import('./src/lib/animalHealthRequestHook.js');
check('hook correctly reports the fields are absent',
  (await hasAnimalHealthRequestFields()) === false);

// Restore the request so the test does not leave demo data in a finished state.
await conn.query('UPDATE requests SET status = ?, admin_notes = ? WHERE id = ?',
  [target.status, null, target.id]);
await conn.query("DELETE FROM request_status_log WHERE note = 'Animal health hook test'");
await conn.end();

console.log(`\npassed: ${passed}`);
if (failures.length) {
  console.log(`FAILED: ${failures.length}`);
  for (const f of failures) console.log('  - ' + f);
} else {
  console.log('all request hook checks passed');
}

// Importing the hook pulls in the shared connection pool, whose open sockets keep
// the event loop alive. Closing the pool lets the process exit on its own; forcing
// an exit instead races the still-closing handles.
const { pool } = await import('./src/config/db.js');
await pool.end();
process.exitCode = failures.length ? 1 : 0;

console.log(`\npassed: ${passed}`);
if (failures.length) {
  console.log(`FAILED: ${failures.length}`);
  for (const f of failures) console.log('  - ' + f);
  process.exitCode = 1;
} else {
  console.log('all request hook checks passed');
}