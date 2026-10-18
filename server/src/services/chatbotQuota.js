import rateLimits from '../config/rateLimits.js';

// Daily question quotas for the chatbot, plus a global spend guard.
//
// Two audiences are tracked in fully separate pools so neither can borrow from
// the other:
//
//   signed-in  -> per-user counter + the "user" shared counter  (20 / 800)
//   anonymous  -> per-visitor counter + the "anon" shared counter (5 / 200)
//
// plus a per-IP anonymous ceiling and a whole-service token budget.
//
// Storage is an in-process Map. Node runs JavaScript on a single thread and the
// reserve below is fully synchronous (no await between the check and the bump),
// so a check-and-increment cannot interleave with another request: concurrent
// callers can never overshoot a counter. This is the "shared storage with atomic
// operations" for a single-instance deployment; a Redis/MySQL backend can be
// dropped in behind the same four functions if the service is ever scaled out.
//
// Counters are keyed by the quota day, so rollover needs no sweep to be correct;
// old keys simply stop matching and are dropped opportunistically.

const HOUR_MS = 60 * 60 * 1000;
const counters = new Map();
const SWEEP_AT = 20_000;

// The quota day is the calendar date (Asia/Manila, pinned in config/tz.js) shifted
// back by resetHour, so a reset at e.g. 06:00 keeps the same key until 06:00.
export function quotaDay(now = Date.now()) {
  const d = new Date(now - rateLimits.chatbot.resetHour * HOUR_MS);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function counterKey(day, scope, id) {
  return `${day}|${scope}|${id}`;
}

function peek(key) {
  return counters.get(key) || 0;
}

function maybeSweep(day) {
  if (counters.size < SWEEP_AT) return;
  const prefix = `${day}|`;
  for (const key of counters.keys()) {
    if (!key.startsWith(prefix)) counters.delete(key);
  }
}

function bump(key, delta, day) {
  const next = Math.max(0, peek(key) + delta);
  counters.set(key, next);
  maybeSweep(day);
  return next;
}

// Which counters a request of this audience consumes, and the ceiling of each.
function plansFor({ audience, identity, ip }, day) {
  const cfg = rateLimits.chatbot;
  if (audience === 'user') {
    return [
      { key: counterKey(day, 'user', identity), limit: cfg.userPerDay, kind: 'user' },
      { key: counterKey(day, 'user', 'shared'), limit: cfg.userSharedPerDay, kind: 'user-shared' },
    ];
  }
  const plans = [
    { key: counterKey(day, 'anon', identity), limit: cfg.anonPerDay, kind: 'anon' },
    { key: counterKey(day, 'anon', 'shared'), limit: cfg.anonSharedPerDay, kind: 'anon-shared' },
  ];
  if (ip) plans.push({ key: counterKey(day, 'anon-ip', ip), limit: cfg.anonPerIpPerDay, kind: 'anon-ip' });
  return plans;
}

// Atomically reserve one question. Every applicable counter must have room before
// any is touched, so a denial never partially consumes a pool.
//
// Returns { allowed: true, day, audience, counters } where `counters` lists the
// keys that were incremented (hand them back to releaseQuota on failure), or
// { allowed: false, reason, day, audience } with reason naming the ceiling hit.
export function reserveQuota({ audience, identity, ip, now }) {
  const day = quotaDay(now);
  const plans = plansFor({ audience, identity, ip }, day);

  for (const plan of plans) {
    if (peek(plan.key) >= plan.limit) {
      return { allowed: false, reason: plan.kind, day, audience };
    }
  }
  for (const plan of plans) bump(plan.key, 1, day);

  return { allowed: true, day, audience, counters: plans.map((p) => p.key) };
}

// Refund a reservation that never produced a delivered answer, so a provider
// failure or a 500 does not spend the caller's completed-question allowance.
export function releaseQuota(reservation) {
  if (!reservation || !reservation.allowed || !Array.isArray(reservation.counters)) return;
  for (const key of reservation.counters) bump(key, -1, reservation.day);
}

// How many tokens have been reported by the provider so far today.
export function tokensUsedToday(now) {
  return peek(counterKey(quotaDay(now), 'tokens', 'global'));
}

// Add a completed call's reported usage (prompt + completion tokens).
export function addTokenUsage(n, now) {
  const amount = Math.max(0, Math.floor(Number(n) || 0));
  const day = quotaDay(now);
  if (!amount) return peek(counterKey(day, 'tokens', 'global'));
  return bump(counterKey(day, 'tokens', 'global'), amount, day);
}

// True once the day's token budget is spent; the route then refuses to call the
// provider for either pool.
export function tokenBudgetExceeded(now) {
  return tokensUsedToday(now) >= rateLimits.chatbot.tokenDailyBudget;
}

export function quotaRemaining({ audience, identity, ip, now }) {
  const day = quotaDay(now);
  const plans = plansFor({ audience, identity, ip }, day);
  return plans.reduce((min, plan) => Math.min(min, Math.max(0, plan.limit - peek(plan.key))), Infinity);
}

// Read-only view for tests and operator endpoints.
export function quotaSnapshot() {
  return { day: quotaDay(), counters: Object.fromEntries(counters) };
}

// Tests only: forget every counter so a run starts from a clean slate.
export function resetQuotaStore() {
  counters.clear();
}
