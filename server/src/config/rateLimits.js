import dotenv from 'dotenv';

// Loaded here as well as in index.js: ESM evaluates imported modules before the
// importing module's own body, so this file can be reached (through the route
// imports) before index.js ever calls dotenv.config(). Reading env lazily is not
// worth it for a handful of small objects, so the file just loads it itself.
// dotenv.config() never overwrites a variable that is already set, so a second
// call is harmless.
dotenv.config();

// ---- helpers ---------------------------------------------------------------

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function envNum(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function envBool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(raw).trim());
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// ---- config ----------------------------------------------------------------
//
// Every limit lives here so it can be tuned from .env without touching a route.
// Windows are milliseconds; `max` is the number of requests allowed per window.

export const rateLimits = {
  // Anonymous reads of public data (programs/events, landing content, FAQs,
  // carousel, the anonymous home feed). Generous, and every response is cached
  // for a minute so a browse session rarely reaches the counter.
  publicData: {
    windowMs: MINUTE,
    max: envInt('RL_PUBLIC_MAX', 120),
    cacheTtlMs: envInt('RL_PUBLIC_CACHE_MS', 60_000),
  },

  // Signed-in callers (mobile app + admin portal) are keyed by user id, not IP,
  // and get a much larger budget than anonymous visitors.
  authenticated: {
    windowMs: MINUTE,
    max: envInt('RL_AUTH_MAX', 300),
  },

  chatbot: {
    // Per-minute burst limits, keyed by identity (user id, or IP + anon cookie).
    anonPerMinute: envInt('RL_CHATBOT_ANON_PER_MIN', 10),
    userPerMinute: envInt('RL_CHATBOT_USER_PER_MIN', 40),

    // Daily question quotas. The two audiences sit in SEPARATE pools: one visitor
    // can never draw on the signed-in allowance and vice versa. Inside a pool an
    // identity has its own counter and the whole audience shares a second one.
    userPerDay: envInt('RL_CHATBOT_USER_PER_DAY', 20),
    userSharedPerDay: envInt('RL_CHATBOT_USER_SHARED_PER_DAY', 800),
    anonPerDay: envInt('RL_CHATBOT_ANON_PER_DAY', 5),
    anonSharedPerDay: envInt('RL_CHATBOT_ANON_SHARED_PER_DAY', 200),
    // Abuse net: the anonymous id rides in a cookie the visitor can clear, so a
    // per-IP ceiling catches one network minting fresh ids to reset its allowance.
    anonPerIpPerDay: envInt('RL_CHATBOT_ANON_PER_IP_DAY', 15),

    // Global OpenRouter spend guard, independent of the pool split. Counted in
    // tokens/day from the provider's reported usage; both pools together must stay
    // under it. When reached the provider is not called again until the reset.
    tokenDailyBudget: envInt('LLM_DAILY_TOKEN_BUDGET', 2_000_000),

    // Hour (0-23, Asia/Manila) at which every daily counter rolls over.
    resetHour: envInt('RL_CHATBOT_RESET_HOUR', 0),

    // A visitor who sends more than this many messages inside captchaWindowMs is
    // asked to solve a CAPTCHA (only when Turnstile is enabled).
    captchaAfter: envInt('RL_CHATBOT_CAPTCHA_AFTER', 5),
    captchaWindowMs: envInt('RL_CHATBOT_CAPTCHA_WINDOW_MS', 10 * MINUTE),
    maxMessageChars: envInt('RL_CHATBOT_MAX_CHARS', 500),
  },

  otp: {
    // 1 per 60s and 5 per hour per normalized phone number, 10 per hour per IP.
    phoneMinute: { windowMs: MINUTE, max: envInt('RL_OTP_PHONE_PER_MIN', 1) },
    phoneHour: { windowMs: HOUR, max: envInt('RL_OTP_PHONE_PER_HOUR', 5) },
    ipHour: { windowMs: HOUR, max: envInt('RL_OTP_IP_PER_HOUR', 10) },
    // Platform-wide daily SMS ceiling and the credit floor below which sending
    // is refused even if the ceiling has not been reached.
    dailySmsCap: envInt('OTP_DAILY_SMS_CAP', 300),
    minSmsCredits: envNum('SMS_MIN_CREDITS', 100),
  },

  login: {
    // Failures only (successful sign-ins do not count). 10 failures / 5 min per
    // mobile number AND IP, plus a progressively longer pause per prior failure.
    windowMs: 5 * MINUTE,
    max: envInt('RL_LOGIN_MAX', 10),
    delayStepMs: envInt('RL_LOGIN_DELAY_STEP_MS', 800),
    delayMaxMs: envInt('RL_LOGIN_DELAY_MAX_MS', 8000),
  },

  forgot: {
    // Forgot-password code requests: per IP and per number, both hourly. The
    // per-number budget only gates actual sends (registered numbers); the per-IP
    // budget counts every request, registered or not, without revealing which
    // was which.
    windowMs: HOUR,
    ipPerHour: envInt('RL_FORGOT_IP_PER_HOUR', 5),
    numberPerHour: envInt('RL_FORGOT_PER_NUMBER_PER_HOUR', 5),
  },

  // Contact / feedback forms feed this. No such endpoint exists yet, so it is
  // exported for when one is added.
  contact: {
    windowMs: HOUR,
    max: envInt('RL_CONTACT_MAX', 5),
  },

  // Anonymous session cookie. The ID is opaque and carries no personal data; it
  // only exists so one NAT'd visitor cannot spend every other visitor's budget.
  anonCookie: {
    name: process.env.ANON_COOKIE_NAME || 'acm_anon',
    maxAgeSeconds: envInt('ANON_COOKIE_MAX_AGE', 30 * 24 * 60 * 60),
    sameSite: process.env.ANON_COOKIE_SAMESITE || 'Lax',
    secure: envBool('ANON_COOKIE_SECURE', false),
    domain: process.env.ANON_COOKIE_DOMAIN || '',
  },

  // Cloudflare Turnstile (or a pluggable verifier). Off unless a secret is set,
  // so local development and the mobile app keep working token-less.
  turnstile: {
    enabled: envBool('TURNSTILE_ENABLED', Boolean(process.env.TURNSTILE_SECRET)),
    secret: process.env.TURNSTILE_SECRET || '',
    verifyUrl: process.env.TURNSTILE_VERIFY_URL || 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    // Public site key, only used by the landing browser widget.
    siteKey: process.env.TURNSTILE_SITE_KEY || '',
    // Opt-in only: OTP code requests come from the mobile app, which cannot show
    // a Turnstile widget, so the challenge there stays OFF unless this is
    // explicitly turned on (for a future browser flow).
    enforceOtp: envBool('TURNSTILE_ENFORCE_OTP', false),
  },

  // The AI provider call itself is bounded so one slow request cannot hold a
  // connection forever or produce an unbounded bill.
  llm: {
    timeoutMs: envInt('LLM_TIMEOUT_MS', 30_000),
    maxOutputTokens: envInt('LLM_MAX_OUTPUT_TOKENS', 1200),
    maxOutputChars: envInt('LLM_MAX_OUTPUT_CHARS', 8000),
  },
};

export default rateLimits;
