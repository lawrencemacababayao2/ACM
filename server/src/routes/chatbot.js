import { Router } from 'express';
import { answer, maoContactText } from '../services/chatbot.js';
import { wrap, HttpError } from '../lib/utils.js';
import { optionalAuth } from '../middleware/auth.js';
import { beneficiaryTypeForUser } from '../lib/targetTypes.js';
import { pool } from '../config/db.js';
import { anonSession } from '../middleware/anonSession.js';
import {
  chatbotLimits,
  anonKey,
  userKey,
  slidingHit,
  slidingCount,
} from '../middleware/rateLimit.js';
import {
  reserveQuota,
  releaseQuota,
  addTokenUsage,
  tokenBudgetExceeded,
} from '../services/chatbotQuota.js';
import { turnstileEnabled, verifyTurnstileToken, tokenFrom } from '../middleware/turnstile.js';
import rateLimits from '../config/rateLimits.js';

const router = Router();

// Who is asking decides what the assistant is allowed to answer from.
//
// The public landing website calls this with no token at all, so an anonymous
// request is scoped to *public* information only: programs and trainings aimed
// at the general public, exactly what the website itself shows.
// A signed-in beneficiary (the mobile app sends its bearer token) gets their own
// audience, and only a Super Admin sees everything. userId rides along for every
// signed-in caller so the assistant can report their own requests.
async function resolveScope(req) {
  if (!req.user) return { kind: 'public' };
  if (req.user.role === 'super_admin') return { kind: 'admin', userId: req.user.id };
  const type = await beneficiaryTypeForUser(pool, req.user.id);
  // A user with no beneficiary profile is treated as the general public rather
  // than silently receiving every registered-group post.
  return type
    ? { kind: 'beneficiary', type, userId: req.user.id }
    : { kind: 'public', userId: req.user.id };
}

// Cheap filter for messages that carry no information at all (repeated keysmashes
// "asdfasdf", a wall of punctuation, "aaaaaaaaaaa"). Genuine questions with a few
// real words are never affected.
function isLowInfoSpam(text) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length >= 4) return false;
  const uniq = new Set(text.toLowerCase().replace(/[^a-z0-9]/g, '').split('').filter(Boolean));
  if (uniq.size <= 2 && text.length >= 10) return true;
  if (uniq.size <= 6 && words.length <= 2 && (/(.{3,})\1{2,}/.test(text))) return true;
  return false;
}

// The whole-service token budget has run out. The request is *not* an error --
// the visitor just gets a polite "come back tomorrow" answer instead, which the
// frontends render as a normal assistant bubble.
async function restingMessage(lang) {
  const contact = await maoContactText();
  if (lang === 'bis') {
    return `Nagpahulay na ang assistant karon adlawa. Palihug kontaka ang MAO office, ${contact}, para sa tabang, o sulayi usab ugma.`;
  }
  return `The assistant has reached today\u2019s limit and is resting now. Please contact the MAO office, ${contact}, for help, or try again tomorrow.`;
}

// A daily quota was reached. Which message depends on which ceiling was hit, so a
// caller who simply used up their own questions is told that plainly, while a
// shared-pool exhaustion reads like the old whole-service rest message.
async function quotaMessage(audience, reason, lang) {
  const cfg = rateLimits.chatbot;
  const contact = await maoContactText();
  const bis = lang === 'bis';
  const perDay = audience === 'user' ? cfg.userPerDay : cfg.anonPerDay;

  if (reason === 'user') {
    return bis
      ? `Naabot na nimo ang ${perDay} ka pangutana matag adlaw. Mahimo ka nang mangutana pag-usab human sa adlaw-adlaw nga pag-reset.`
      : `You have reached your daily limit of ${perDay} questions. You can ask again after the daily reset.`;
  }
  if (reason === 'anon') {
    return bis
      ? `Ang mga bisita makapangutana og ${perDay} ka beses matag adlaw. Palihug sulayi pag-usab human sa adlaw-adlaw nga pag-reset.`
      : `Visitors can ask ${perDay} questions per day. Please try again after the daily reset.`;
  }
  if (reason === 'anon-ip') {
    return bis
      ? `Naabot na sa kini nga network ang limitasyon sa mga bisita karong adlawa. Palihug sulayi pag-usab ugma, o kontaka ang MAO office, ${contact}.`
      : `This network has reached today\u2019s visitor limit. Please try again after the daily reset, or contact the MAO office, ${contact}.`;
  }
  return restingMessage(lang);
}

function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((h) => ({
      role: h && h.role === 'assistant' ? 'assistant' : h && h.role === 'user' ? 'user' : null,
      content: h && typeof h.content === 'string' ? h.content.trim().slice(0, 500) : '',
    }))
    .filter((h) => h.role && h.content)
    .slice(-6);
}

// POST /api/chatbot  { message, lang?, history? }
// Auth is optional on purpose: the token decides the scope, not access itself.
// The visitor key drives three overlapping guards:
//   1. a per-minute burst limit (middleware/rateLimit. chatbotLimits),
//   2. daily question quotas in two sealed pools -- signed-in and anonymous --
//      plus a per-IP anonymous net (services/chatbotQuota),
//   3. a whole-service token budget that stops the provider bill, and a Turnstile
//      challenge after a burst of messages from one visitor.
router.post('/', optionalAuth, anonSession, chatbotLimits, wrap(async (req, res) => {
  const { message, lang, history } = req.body || {};
  if (!message || !String(message).trim()) throw new HttpError(400, 'Message is required');
  const text = String(message).trim();
  if (text.length > rateLimits.chatbot.maxMessageChars) {
    throw new HttpError(400, `Keep questions under ${rateLimits.chatbot.maxMessageChars} characters please.`, { field: 'message' });
  }
  if (isLowInfoSpam(text)) throw new HttpError(400, 'That looks like spam. Please type a real question.', { field: 'message' });

  const visitorKey = req.user ? userKey(req) : anonKey(req);
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';

  // Robot gate: only anonymous visitors, only after a short burst, only when the
  // feature is actually configured. Below the threshold the token is ignored, and
  // when Turnstile is unset the whole branch is a no-op (local dev, tests, mobile).
  if (turnstileEnabled() && !req.user &&
      slidingCount(visitorKey, rateLimits.chatbot.captchaWindowMs) >= rateLimits.chatbot.captchaAfter) {
    const verdict = await verifyTurnstileToken(tokenFrom(req), req.ip);
    if (!verdict.ok) {
      throw new HttpError(400, 'Please complete the human verification to continue chatting.', {
        captcha: true,
        error: 'CAPTCHA_REQUIRED',
        field: 'turnstileToken',
      });
    }
  }

  // Global spend guard, checked before either pool so no request can call the
  // provider once the day's token budget is spent.
  if (tokenBudgetExceeded()) {
    console.log('[chatbot] source=budget');
    return res.json({ answer: await restingMessage(lang), source: 'cap' });
  }

  // Audience is decided by the signed-in account, never by what a message claims.
  const audience = req.user ? 'user' : 'anon';
  // Anonymous visitors are keyed by the server-issued cookie id; a caller who did
  // not return the cookie is counted by IP so clearing it cannot reset the quota.
  const identity = req.user
    ? `u:${req.user.id}`
    : (req.anon?.persisted ? `a:${req.anon.id}` : `ip:${ip}`);

  const reservation = reserveQuota({ audience, identity, ip });
  if (!reservation.allowed) {
    console.log(`[chatbot] source=quota audience=${audience} reason=${reservation.reason}`);
    return res.json({ answer: await quotaMessage(audience, reservation.reason, lang), source: 'cap' });
  }

  let result;
  try {
    const scope = await resolveScope(req);
    result = await answer(message, lang, scope, sanitizeHistory(history));
  } catch (err) {
    // A request that never produced an answer must not spend a question.
    releaseQuota(reservation);
    throw err;
  }

  addTokenUsage(result.tokens);
  slidingHit(visitorKey, rateLimits.chatbot.captchaWindowMs);
  // Only the client-facing fields go out; `tokens` is internal billing detail.
  res.json({ answer: result.answer, source: result.source, received: message });
}));

export default router;
