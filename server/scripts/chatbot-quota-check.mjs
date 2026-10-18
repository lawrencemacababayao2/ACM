// Acceptance checks for the chatbot daily quotas and the token-budget guard.
//
// Runs entirely in-process and does NOT touch the database: it drives the quota
// store directly and, for the wiring, mounts the real chatbot router and only
// exercises the paths that never reach the LLM (quota/budget denials). A request
// that would reach answer() is intentionally avoided so no DB is needed.
//
//   node scripts/chatbot-quota-check.mjs
//
// Exits 0 when every case passes, 1 otherwise.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'quota-test-secret';
// Burst limit high so it never interferes with the daily-quota assertions.
process.env.RL_CHATBOT_ANON_PER_MIN = '1000';
process.env.RL_CHATBOT_USER_PER_MIN = '1000';
// Signed-in pool: 2 per account, 3 shared.
process.env.RL_CHATBOT_USER_PER_DAY = '2';
process.env.RL_CHATBOT_USER_SHARED_PER_DAY = '3';
// Anonymous pool: 2 per visitor, a large shared pool (so per-IP can be isolated),
// 3 per IP.
process.env.RL_CHATBOT_ANON_PER_DAY = '2';
process.env.RL_CHATBOT_ANON_SHARED_PER_DAY = '1000';
process.env.RL_CHATBOT_ANON_PER_IP_DAY = '3';
process.env.LLM_DAILY_TOKEN_BUDGET = '1000';
process.env.RL_CHATBOT_RESET_HOUR = '6';

await import('../src/config/tz.js');
const express = (await import('express')).default;
const q = await import('../src/services/chatbotQuota.js');
const chatbotRoutes = (await import('../src/routes/chatbot.js')).default;

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${extra ? ' :: ' + extra : ''}`); }
}

const DAY1 = new Date('2026-01-01T10:00:00+08:00').getTime();
const DAY2 = new Date('2026-01-02T10:00:00+08:00').getTime();

// --- 1. Daily reset boundary (resetHour = 06:00 Asia/Manila) -----------------
{
  const beforeReset = new Date('2026-01-02T05:00:00+08:00').getTime();
  const afterReset = new Date('2026-01-02T06:30:00+08:00').getTime();
  check('reset: same key before the reset hour', q.quotaDay(DAY1) === q.quotaDay(beforeReset));
  check('reset: new key after the reset hour', q.quotaDay(beforeReset) !== q.quotaDay(afterReset));
  check('reset: day format is YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(q.quotaDay(DAY1)));
}

// --- 2. Signed-in: per-account limit -----------------------------------------
{
  q.resetQuotaStore();
  const a = q.reserveQuota({ audience: 'user', identity: 'u:1', now: DAY1 });
  const b = q.reserveQuota({ audience: 'user', identity: 'u:1', now: DAY1 });
  const c = q.reserveQuota({ audience: 'user', identity: 'u:1', now: DAY1 });
  check('user: allows up to the per-account limit', a.allowed && b.allowed);
  check('user: next is denied on the personal counter', !c.allowed && c.reason === 'user');
}

// --- 3. Signed-in: shared pool exhaustion ------------------------------------
{
  q.resetQuotaStore();
  const ok1 = q.reserveQuota({ audience: 'user', identity: 'u:1', now: DAY1 });
  const ok2 = q.reserveQuota({ audience: 'user', identity: 'u:2', now: DAY1 });
  const ok3 = q.reserveQuota({ audience: 'user', identity: 'u:3', now: DAY1 });
  const blocked = q.reserveQuota({ audience: 'user', identity: 'u:4', now: DAY1 });
  check('user: distinct accounts allowed until the shared ceiling', ok1.allowed && ok2.allowed && ok3.allowed);
  check('user: shared ceiling blocks a fresh account', !blocked.allowed && blocked.reason === 'user-shared');
}

// --- 4. Anonymous: per-visitor limit + per-IP net ----------------------------
{
  q.resetQuotaStore();
  const a = q.reserveQuota({ audience: 'anon', identity: 'a:1', ip: '1.1.1.1', now: DAY1 });
  const b = q.reserveQuota({ audience: 'anon', identity: 'a:1', ip: '1.1.1.1', now: DAY1 });
  const c = q.reserveQuota({ audience: 'anon', identity: 'a:1', ip: '1.1.1.1', now: DAY1 });
  check('anon: allows up to the per-visitor limit', a.allowed && b.allowed);
  check('anon: next is denied on the personal counter', !c.allowed && c.reason === 'anon');
}
{
  q.resetQuotaStore();
  // Fresh identities every time but one shared IP: only the per-IP net can bite.
  const r = [1, 2, 3, 4].map((i) => q.reserveQuota({ audience: 'anon', identity: `a:${i}`, ip: '9.9.9.9', now: DAY1 }));
  check('anon: per-IP net allows up to its ceiling', r[0].allowed && r[1].allowed && r[2].allowed);
  check('anon: per-IP net blocks a cookie-clearing visitor', !r[3].allowed && r[3].reason === 'anon-ip');
}

// --- 5. Anonymous: shared pool exhaustion ------------------------------------
{
  q.resetQuotaStore();
  let allowed = 0;
  let reason = null;
  for (let i = 0; i < 1001; i += 1) {
    const r = q.reserveQuota({ audience: 'anon', identity: `a:${i}`, ip: `10.0.${Math.floor(i / 250)}.${i % 250}`, now: DAY1 });
    if (r.allowed) allowed += 1; else { reason = r.reason; break; }
  }
  check('anon: distinct visitors drain exactly the shared pool', allowed === 1000, `allowed=${allowed}`);
  check('anon: shared ceiling blocks further anonymous requests', reason === 'anon-shared', `reason=${reason}`);
}

// --- 6. Pools are sealed: no borrowing in either direction --------------------
{
  q.resetQuotaStore();
  q.reserveQuota({ audience: 'user', identity: 'u:1', now: DAY1 });
  q.reserveQuota({ audience: 'user', identity: 'u:2', now: DAY1 });
  q.reserveQuota({ audience: 'user', identity: 'u:3', now: DAY1 });
  const userBlocked = q.reserveQuota({ audience: 'user', identity: 'u:4', now: DAY1 });
  const anonStill = q.reserveQuota({ audience: 'anon', identity: 'a:1', ip: '2.2.2.2', now: DAY1 });
  check('sealed: signed-in pool full does not block visitors', !userBlocked.allowed && anonStill.allowed);
}
{
  q.resetQuotaStore();
  q.reserveQuota({ audience: 'anon', identity: 'a:1', ip: '3.3.3.3', now: DAY1 });
  q.reserveQuota({ audience: 'anon', identity: 'a:1', ip: '3.3.3.3', now: DAY1 });
  const anonBlocked = q.reserveQuota({ audience: 'anon', identity: 'a:1', ip: '3.3.3.3', now: DAY1 });
  const userStill = q.reserveQuota({ audience: 'user', identity: 'u:1', now: DAY1 });
  check('sealed: visitor pool full does not block signed-in users', !anonBlocked.allowed && userStill.allowed);
}

// --- 7. Concurrent reservations cannot overshoot -----------------------------
{
  q.resetQuotaStore();
  const results = await Promise.all(
    Array.from({ length: 50 }, () =>
      Promise.resolve().then(() => q.reserveQuota({ audience: 'anon', identity: 'a:race', ip: '5.5.5.5', now: DAY1 })))
  );
  const allowed = results.filter((r) => r.allowed).length;
  check('race: exactly the per-visitor limit gets through', allowed === 2, `allowed=${allowed}`);
}
{
  q.resetQuotaStore();
  const results = await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      Promise.resolve().then(() => q.reserveQuota({ audience: 'user', identity: `u:race${i}`, now: DAY1 })))
  );
  const allowed = results.filter((r) => r.allowed).length;
  check('race: shared pool cannot be overshot', allowed === 3, `allowed=${allowed}`);
}

// --- 8. Failure refunds a reservation ----------------------------------------
{
  q.resetQuotaStore();
  const r = q.reserveQuota({ audience: 'anon', identity: 'a:refund', ip: '6.6.6.6', now: DAY1 });
  const key = `a:refund`;
  const afterReserve = q.quotaRemaining({ audience: 'anon', identity: key, ip: '6.6.6.6', now: DAY1 });
  q.releaseQuota(r);
  const afterRelease = q.quotaRemaining({ audience: 'anon', identity: key, ip: '6.6.6.6', now: DAY1 });
  const reuse = q.reserveQuota({ audience: 'anon', identity: key, ip: '6.6.6.6', now: DAY1 });
  check('refund: reservation consumes a unit', afterReserve === 1);
  check('refund: release gives the unit back', afterRelease === 2);
  check('refund: refunded unit is reusable', reuse.allowed);
}

// --- 9. Daily reset frees every counter --------------------------------------
{
  q.resetQuotaStore();
  q.reserveQuota({ audience: 'anon', identity: 'a:1', ip: '7.7.7.7', now: DAY1 });
  const blockedToday = q.reserveQuota({ audience: 'anon', identity: 'a:1', ip: '7.7.7.7', now: DAY1 });
  const nextDay = q.reserveQuota({ audience: 'anon', identity: 'a:1', ip: '7.7.7.7', now: DAY2 });
  check('reset: personal counter is exhausted today', blockedToday.allowed);
  check('reset: the next day allows the identity again', nextDay.allowed);
}

// --- 10. Global token budget (independent of the pools) ----------------------
{
  q.resetQuotaStore();
  const under = q.tokenBudgetExceeded(DAY1);
  q.addTokenUsage(400, DAY1);
  const stillUnder = q.tokenBudgetExceeded(DAY1);
  q.addTokenUsage(600, DAY1);
  const over = q.tokenBudgetExceeded(DAY1);
  const used = q.tokensUsedToday(DAY1);
  check('budget: starts under', under === false);
  check('budget: partial usage stays under', stillUnder === false && used === 1000);
  check('budget: reaching the cap trips the guard', over === true);
  // A fresh person on the next day is unaffected by yesterday's spend.
  check('budget: resets with the day', q.tokenBudgetExceeded(DAY2) === false);
}

// --- 11. Route wiring: anonymous denial never reaches the LLM ----------------
{
  q.resetQuotaStore();
  const app = express();
  app.use(express.json());
  app.use('/api/chatbot', chatbotRoutes);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const post = async (body) => {
    const res = await fetch(`${base}/api/chatbot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Connection: 'close' },
      body: JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* no body */ }
    return { status: res.status, json };
  };

  // Drain the anonymous SHARED pool (identity/IP agnostic), then a real request
  // must be answered from the quota branch (source 'cap') without calling
  // answer(). Using the shared pool keeps this independent of how the test host
  // reports the loopback address (IPv4 vs IPv6-mapped).
  for (let i = 0; i < 1000; i += 1) {
    q.reserveQuota({ audience: 'anon', identity: `a:drain${i}`, ip: `11.0.${Math.floor(i / 250)}.${i % 250}`, now: Date.now() });
  }
  const denied = await post({ message: 'Hello there, what programs are available?' });
  check('route: exhausted anonymous pool gets a cap answer', denied.status === 200 && denied.json?.source === 'cap');
  check('route: cap answer is human text', typeof denied.json?.answer === 'string' && denied.json.answer.length > 20);

  // Spend the token budget; the next anonymous request is refused before reserve.
  q.resetQuotaStore();
  q.addTokenUsage(1000, Date.now());
  const budgeted = await post({ message: 'Hello there, what programs are available?' });
  check('route: spent token budget yields a resting cap answer', budgeted.status === 200 && budgeted.json?.source === 'cap');

  await new Promise((resolve) => server.close(resolve));
}

// The router pulls in the shared DB pool; close it so the process can exit
// cleanly (an abrupt process.exit with live libuv handles aborts on Windows).
const { pool } = await import('../src/config/db.js');
await pool.end();

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
