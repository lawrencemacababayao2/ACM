import { Router } from 'express';
import { answer } from '../services/chatbot.js';
import { wrap, HttpError } from '../lib/utils.js';
import { optionalAuth, ADMIN_ROLES } from '../middleware/auth.js';
import { beneficiaryTypeForUser } from '../lib/targetTypes.js';
import { pool } from '../config/db.js';
import { anonSession } from '../middleware/anonSession.js';
import {
  chatbotLimits,
  consumeDailyBudget,
  anonKey,
  userKey,
  slidingHit,
  slidingCount,
} from '../middleware/rateLimit.js';
import { turnstileEnabled, verifyTurnstileToken, tokenFrom } from '../middleware/turnstile.js';
import rateLimits from '../config/rateLimits.js';

const router = Router();

// Who is asking decides what the assistant is allowed to answer from.
//
// The public landing website calls this with no token at all, so an anonymous
// request is scoped to *public* information only: programs, trainings and
// advisories aimed at the general public, exactly what the website itself shows.
// A signed-in beneficiary (the mobile app sends its bearer token) gets their own
// audience, and staff keep seeing everything.
async function resolveScope(req) {
  if (!req.user) return { kind: 'public' };
  if (ADMIN_ROLES.includes(req.user.role)) return { kind: 'admin' };
  const type = await beneficiaryTypeForUser(pool, req.user.id);
  // A user with no beneficiary profile is treated as the general public rather
  // than silently receiving every registered-group post.
  return type ? { kind: 'beneficiary', type } : { kind: 'public' };
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

// The whole-service daily budget has run out. The request is *not* an error --
// the visitor just gets a polite "come back tomorrow" answer instead, which the
// frontends render as a normal assistant bubble.
function restingMessage(lang) {
  if (lang === 'bis') {
    return 'Nagpahulay na ang assistant karon adlawa. Palihug kontaka ang MAO office (Medina Municipal Agriculture Office) para sa tabang, o sulayi usab ugma.';
  }
  return 'The assistant has reached today\u2019s limit and is resting now. Please contact the MAO office (Medina Municipal Agriculture Office) for help, or try again tomorrow.';
}

// POST /api/chatbot  { message, lang? }
// Auth is optional on purpose: the token decides the scope, not access itself.
// The visitor key drives three overlapping guards:
//   1. per-minute + per-day budgets (middleware/rateLimit. chatbotLimits),
//   2. a whole-service daily cap that stops the provider bill at one number,
//   3. a Turnstile challenge after a burst of messages from one visitor.
router.post('/', optionalAuth, anonSession, chatbotLimits, wrap(async (req, res) => {
  const { message, lang } = req.body || {};
  if (!message || !String(message).trim()) throw new HttpError(400, 'Message is required');
  const text = String(message).trim();
  if (text.length > rateLimits.chatbot.maxMessageChars) {
    throw new HttpError(400, `Keep questions under ${rateLimits.chatbot.maxMessageChars} characters please.`, { field: 'message' });
  }
  if (isLowInfoSpam(text)) throw new HttpError(400, 'That looks like spam. Please type a real question.', { field: 'message' });

  const visitorKey = req.user ? userKey(req) : anonKey(req);

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

  const daily = consumeDailyBudget('chatbot', rateLimits.chatbot.dailyCap);
  if (!daily.allowed) return res.json({ answer: restingMessage(lang), source: 'cap' });

  const scope = await resolveScope(req);
  const result = await answer(message, lang, scope);
  slidingHit(visitorKey, rateLimits.chatbot.captchaWindowMs);
  res.json({ ...result, received: message });
}));

export default router;