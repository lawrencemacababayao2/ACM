import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import rateLimits from '../config/rateLimits.js';
import { anonKey as anonSessionKey } from './anonSession.js';
import { normalizeMobile } from '../services/otp.js';

// One place that turns the config in config/rateLimits.js into express-rate-limit
// middleware. Routes never hard-code a number; they pick a named limiter or call
// makeLimiter() with a config object, so a limit can be retuned (or swapped to a
// Redis Store later) without editing a route.
//
// Every limiter here speaks the same failure language the frontends expect:
//   HTTP 429, a Retry-After header, and
//   { error: "RATE_LIMITED", message, retryAfterSeconds }
// Nothing sensitive is ever logged: only the route, the client IP and the
// rate-limit key. OTP codes, passwords and message bodies never reach the log.

const SECRET = process.env.JWT_SECRET || 'dev-secret';

// ---- block logging ---------------------------------------------------------

const blockCountByRoute = new Map();
let blockTotal = 0;

// Exposed so a test (or an operator endpoint) can read the counters.
export function rateLimitStats() {
  return {
    total: blockTotal,
    byRoute: Object.fromEntries(blockCountByRoute),
  };
}

function logBlock(routeName, req, key) {
  blockTotal += 1;
  blockCountByRoute.set(routeName, (blockCountByRoute.get(routeName) || 0) + 1);
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  console.warn(`[rate-limit] block #${blockTotal} route=${routeName} ip=${ip} key=${key}`);
}

// ---- key helpers -----------------------------------------------------------
//
// Non-IP keys are namespaced (u:, p:, a:) so the library never mistakes a user
// id or phone number for an unnormalised IP address.

const clientIp = (req) => ipKeyGenerator(req.ip || req.socket?.remoteAddress || '0.0.0.0');

function bearerUserId(req) {
  if (req.__rlUserId !== undefined) return req.__rlUserId;
  const header = req.headers.authorization || '';
  let id = null;
  if (header.startsWith('Bearer ')) {
    try {
      const claims = jwt.verify(header.slice(7), SECRET);
      id = claims?.id ?? null;
    } catch {
      id = null;
    }
  }
  req.__rlUserId = id;
  return id;
}

export function userKey(req) {
  const id = req.user?.id ?? bearerUserId(req);
  return id ? `u:${id}` : clientIp(req);
}

export function phoneKey(req, field = 'mobile') {
  // Defensive: if this is ever used directly as a keyGenerator it receives
  // (req, res), so a non-string second argument falls back to the default field.
  const name = typeof field === 'string' ? field : 'mobile';
  return `p:${normalizeMobile(req.body?.[name] || '')}`;
}

export function anonKey(req) {
  return `a:${anonSessionKey(req)}`;
}

function loginKey(req) {
  const id = normalizeMobile(req.body?.mobile || req.body?.email || '');
  return `l:${clientIp(req)}|${id}`;
}

// ---- limiter factory -------------------------------------------------------

export function makeLimiter(routeName, options = {}) {
  const {
    windowMs,
    max,
    message = 'Too many requests, please try again later.',
    keyGenerator = clientIp,
    skip,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = options;

  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: true,
    legacyHeaders: true,
    skipSuccessfulRequests,
    skipFailedRequests,
    skip,
    keyGenerator,
    // trust proxy is off for this deployment, so an X-Forwarded-For header from a
    // client is simply ignored (req.ip stays the socket address). The default
    // validation would log a warning for every scanner that sends one; turning it
    // off keeps the logs about real blocks instead of noise.
    validate: { xForwardedForHeader: false },
    handler: (req, res) => {
      const key = keyGenerator(req);
      const resetTime = req.rateLimit?.resetTime ? new Date(req.rateLimit.resetTime).getTime() : Date.now() + windowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));
      logBlock(routeName, req, key);
      res.set('Retry-After', String(retryAfterSeconds));
      res.status(429).json({ error: 'RATE_LIMITED', message, retryAfterSeconds });
    },
  });
}

// ---- named limiters --------------------------------------------------------

// Public data GETs: 120/min per IP. Shared responses are cached for a minute
// (see simpleCache), so a normal browse is well under this.
export const publicDataLimiter = makeLimiter('public-data', {
  ...rateLimits.publicData,
  keyGenerator: clientIp,
  message: 'Too many requests from this network. Please slow down and try again shortly.',
});

// Any request carrying a valid token (mobile app or admin portal): 300/min per
// user id, independent of the anonymous budget and of every other user.
export const authenticatedLimiter = makeLimiter('authenticated', {
  ...rateLimits.authenticated,
  keyGenerator: userKey,
  skip: (req) => bearerUserId(req) === null,
  message: 'You are making requests too quickly. Please slow down.',
});

// Chatbot, anonymous: 10/min and 60/day per visitor (IP + anonymous session).
export const chatbotAnonMinute = makeLimiter('chatbot-anon-minute', {
  windowMs: 60_000,
  max: rateLimits.chatbot.anonPerMinute,
  keyGenerator: anonKey,
  message: 'You are asking too quickly. Please wait a moment before sending another question.',
});

export const chatbotAnonDaily = makeLimiter('chatbot-anon-daily', {
  windowMs: 24 * 60 * 60 * 1000,
  max: rateLimits.chatbot.anonPerDay,
  keyGenerator: anonKey,
  message: 'You have reached today\'s question limit for visitors. Please try again tomorrow.',
});

// Chatbot, signed in: a higher allowance keyed by user id.
export const chatbotUserMinute = makeLimiter('chatbot-user-minute', {
  windowMs: 60_000,
  max: rateLimits.chatbot.userPerMinute,
  keyGenerator: userKey,
  message: 'You are asking too quickly. Please wait a moment before sending another question.',
});

// Dispatcher: a signed-in caller uses the user allowance, everyone else the
// anonymous minute + day allowance.
export function chatbotLimits(req, res, next) {
  if (req.user) return chatbotUserMinute(req, res, next);
  return chatbotAnonMinute(req, res, (err) => {
    if (err) return next(err);
    return chatbotAnonDaily(req, res, next);
  });
}

// OTP send: 1/min + 5/hour per phone, 10/hour per IP. Applied in order so the
// cheapest, most specific check reports first.
export const otpPhoneMinute = makeLimiter('otp-phone-minute', {
  ...rateLimits.otp.phoneMinute,
  // Wrapped in an arrow so the library's (req, res) call cannot be misread as the
  // field-name argument (which is how "p:" for every number once happened).
  keyGenerator: (req) => phoneKey(req),
  // A request that never produced a code (bad input, provider outage) must not
  // spend the per-number budget, or a failed send locks the user out of retrying.
  skipFailedRequests: true,
  message: 'Please wait before requesting another verification code.',
});

export const otpPhoneHour = makeLimiter('otp-phone-hour', {
  ...rateLimits.otp.phoneHour,
  keyGenerator: (req) => phoneKey(req),
  skipFailedRequests: true,
  message: 'Too many codes requested for this number. Please try again later.',
});

export const otpIpHour = makeLimiter('otp-ip-hour', {
  ...rateLimits.otp.ipHour,
  keyGenerator: clientIp,
  message: 'Too many verification codes requested from this network. Please try again later.',
});

export const otpSendLimiters = [otpPhoneMinute, otpPhoneHour, otpIpHour];

// Login: count failures only (skipSuccessfulRequests), keyed by mobile/IP.
export const loginLimiter = makeLimiter('login', {
  windowMs: rateLimits.login.windowMs,
  max: rateLimits.login.max,
  keyGenerator: loginKey,
  skipSuccessfulRequests: true,
  message: 'Too many failed sign-in attempts. Please wait a few minutes and try again.',
});

// Contact / feedback: 5/hour per IP. No endpoint uses this yet.
export const contactLimiter = makeLimiter('contact', {
  ...rateLimits.contact,
  keyGenerator: clientIp,
  message: 'Too many messages sent. Please try again later.',
});

// Forgot-password code requests: 5/hour per IP (every request, registered or not).
// The per-number budget for actual sends lives in the route itself.
export const forgotRequestLimiter = makeLimiter('forgot-request', {
  windowMs: rateLimits.forgot.windowMs,
  max: rateLimits.forgot.ipPerHour,
  keyGenerator: clientIp,
  message: 'Too many requests. Please try again later.',
});

// ---- progressive login delay ----------------------------------------------

const loginFailures = new Map();

export function loginDelay(req, res, next) {
  const key = loginKey(req);
  const now = Date.now();
  const recent = (loginFailures.get(key) || []).filter((t) => now - t < rateLimits.login.windowMs);
  loginFailures.set(key, recent);
  if (!recent.length) return next();
  const delay = Math.min(recent.length * rateLimits.login.delayStepMs, rateLimits.login.delayMaxMs);
  return setTimeout(next, delay);
}

// Called by the login route on a rejected attempt so the NEXT attempt is slowed.
export function recordLoginFailure(req) {
  const key = loginKey(req);
  const now = Date.now();
  const recent = (loginFailures.get(key) || []).filter((t) => now - t < rateLimits.login.windowMs);
  recent.push(now);
  loginFailures.set(key, recent);
  if (loginFailures.size > 5000) {
    for (const [k, list] of loginFailures) {
      if (!list.some((t) => now - t < rateLimits.login.windowMs)) loginFailures.delete(k);
    }
  }
}

// ---- global daily budget ---------------------------------------------------

const dailyBudgets = new Map();

function dayStamp(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

// Consumes one unit of a named all-callers daily budget. Returns whether the
// call is allowed and how many are left. Resets itself when the date changes.
export function consumeDailyBudget(name, cap) {
  const today = dayStamp();
  let bucket = dailyBudgets.get(name);
  if (!bucket || bucket.day !== today) {
    bucket = { day: today, count: 0 };
    dailyBudgets.set(name, bucket);
  }
  if (bucket.count >= cap) return { allowed: false, used: bucket.count, cap, remaining: 0 };
  bucket.count += 1;
  return { allowed: true, used: bucket.count, cap, remaining: Math.max(0, cap - bucket.count) };
}

export function dailyBudgetUsed(name) {
  const bucket = dailyBudgets.get(name);
  return bucket && bucket.day === dayStamp() ? bucket.count : 0;
}

// ---- rolling per-key counters ---------------------------------------------

const slidingHits = new Map();

// Records a hit and returns how many hits fall inside the window for this key.
export function slidingHit(key, windowMs, now = Date.now()) {
  const recent = (slidingHits.get(key) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  slidingHits.set(key, recent);
  if (slidingHits.size > 5000) {
    for (const [k, list] of slidingHits) {
      if (!list.some((t) => now - t < windowMs)) slidingHits.delete(k);
    }
  }
  return recent.length;
}

export function slidingCount(key, windowMs, now = Date.now()) {
  return (slidingHits.get(key) || []).filter((t) => now - t < windowMs).length;
}

export const helpers = { clientIp, bearerUserId, loginKey };
