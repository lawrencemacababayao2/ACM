// Acceptance checks for the rate-limit / abuse-protection middleware.
//
// Runs entirely in-process: it builds a throwaway Express app that mounts the
// real limiters (not the real routes, so no database is touched) and drives it
// with fetch. Limits are made tiny via env vars before the config module is
// imported, so each case finishes in milliseconds.
//
//   node scripts/rate-limit-check.mjs
//
// Exits 0 when every case passes, 1 otherwise.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'rate-limit-test-secret';
process.env.RL_PUBLIC_MAX = '3';
process.env.RL_CHATBOT_ANON_PER_MIN = '2';
process.env.RL_AUTH_MAX = '1';
process.env.RL_OTP_PHONE_PER_MIN = '1';
process.env.RL_OTP_PHONE_PER_HOUR = '3';
process.env.RL_OTP_IP_PER_HOUR = '50';
process.env.RL_LOGIN_MAX = '3';
process.env.RL_LOGIN_DELAY_STEP_MS = '300';
process.env.RL_LOGIN_DELAY_MAX_MS = '600';

const express = (await import('express')).default;
const jwt = (await import('jsonwebtoken')).default;
const rl = await import('../src/middleware/rateLimit.js');
const { anonSession } = await import('../src/middleware/anonSession.js');

const app = express();
app.use(express.json());
const ok = (req, res) => res.json({ ok: true });

app.get('/pub', rl.publicDataLimiter, ok);
app.post('/anon', anonSession, rl.chatbotAnonMinute, ok);
app.post('/otp', rl.otpSendLimiters, ok);
app.get('/user', rl.authenticatedLimiter, ok);
// A route that always fails: hits ARE counted, because the limiter counts only
// failures here (skipSuccessfulRequests).
app.post('/login', rl.loginLimiter, rl.loginDelay, (req, res) => res.status(401).json({ error: 'bad' }));
// A route that always succeeds: prove successful attempts are exempt.
app.post('/login-ok', rl.loginLimiter, ok);

const server = app.listen(0);
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${extra ? ' :: ' + extra : ''}`); }
}

async function hit(path, { method = 'GET', body, headers } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json, headers: res.headers };
}

// --- 1. Public limiter: 3/min, then 429 with the standard shape + Retry-After ---
{
  const a = await hit('/pub');
  const b = await hit('/pub');
  const c = await hit('/pub');
  const d = await hit('/pub');
  check('public: first three allowed', a.status === 200 && b.status === 200 && c.status === 200);
  check('public: fourth is 429', d.status === 429);
  check('public: 429 body shape', d.json?.error === 'RATE_LIMITED' && typeof d.json?.message === 'string' && d.json?.retryAfterSeconds >= 1);
  check('public: Retry-After header present', Number(d.headers.get('retry-after')) >= 1);
}

// --- 2. Anonymous session keys: two visitors do not share a budget ---
{
  const first = await hit('/anon', { method: 'POST' });
  const cookie = first.headers.get('set-cookie');
  const firstCookie = (cookie || '').split(';')[0];
  check('anon: cookie issued', /acm_anon=/.test(firstCookie));

  const second = await hit('/anon', { method: 'POST', headers: { Cookie: firstCookie } });
  const third = await hit('/anon', { method: 'POST', headers: { Cookie: firstCookie } });
  check('anon: same visitor limited at 2/min', second.status === 200 && third.status === 429);

  // A different visitor (new cookie) still gets through.
  const other = await hit('/anon', { method: 'POST' });
  check('anon: different visitor allowed', other.status === 200);
  check('anon: only first response sets cookie', !/acm_anon=/.test(second.headers.get('set-cookie') || ''));
}

// --- 3. Phone-based OTP limit: per normalized number ---
{
  const one = await hit('/otp', { method: 'POST', body: { mobile: '0917 123 4567' } });
  const two = await hit('/otp', { method: 'POST', body: { mobile: '+639171234567' } });
  check('otp: first send allowed', one.status === 200);
  check('otp: same number (different format) throttled', two.status === 429);
  const other = await hit('/otp', { method: 'POST', body: { mobile: '09181234567' } });
  check('otp: a different number is independent', other.status === 200);
}

// --- 4. Authenticated limiter: keyed by user id, skipped without a token ---
{
  const mk = (id) => jwt.sign({ id, role: 'beneficiary', tv: 1 }, process.env.JWT_SECRET);
  const u1a = await hit('/user', { headers: { Authorization: 'Bearer ' + mk(1) } });
  const u1b = await hit('/user', { headers: { Authorization: 'Bearer ' + mk(1) } });
  const u2 = await hit('/user', { headers: { Authorization: 'Bearer ' + mk(2) } });
  const anonA = await hit('/user');
  const anonB = await hit('/user');
  check('auth: user 1 limited at 1/min', u1a.status === 200 && u1b.status === 429);
  check('auth: user 2 independent', u2.status === 200);
  check('auth: token-less request skipped', anonA.status === 200 && anonB.status === 200);
}

// --- 5. Login limiter counts failures only ---
{
  let last;
  for (let i = 0; i < 4; i += 1) last = await hit('/login', { method: 'POST', body: { mobile: '09171230000' } });
  check('login: 4th failed attempt is 429', last.status === 429);

  let okCount = 0;
  for (let i = 0; i < 5; i += 1) {
    const r = await hit('/login-ok', { method: 'POST', body: { mobile: '09179999999' } });
    if (r.status === 200) okCount += 1;
  }
  check('login: successful attempts never count', okCount === 5);
}

// --- 6. Daily budget + rolling counters (pure units) ---
{
  const cap = 2;
  const a = rl.consumeDailyBudget('unit-test', cap);
  const b = rl.consumeDailyBudget('unit-test', cap);
  const c = rl.consumeDailyBudget('unit-test', cap);
  check('budget: allows up to cap then blocks', a.allowed && b.allowed && !c.allowed && c.remaining === 0);

  const key = 'sliding-unit';
  rl.slidingHit(key, 60_000);
  rl.slidingHit(key, 60_000);
  check('sliding: counts within window', rl.slidingCount(key, 60_000) === 2);
  check('sliding: zero-width window drops all hits', rl.slidingCount(key, 0) === 0);
}

// --- 7. loginDelay waits after recorded failures ---
{
  const fakeReq = { body: { mobile: '09170000001' }, headers: {}, ip: '10.0.0.9', socket: {} };
  rl.recordLoginFailure(fakeReq);
  const started = Date.now();
  await new Promise((resolve) => rl.loginDelay(fakeReq, {}, resolve));
  const waited = Date.now() - started;
  check('loginDelay: pauses after a failure', waited >= 250, `waited ${waited}ms`);
}

server.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
