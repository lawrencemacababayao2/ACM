import rateLimits from '../config/rateLimits.js';
import { HttpError } from '../lib/utils.js';

// Pluggable CAPTCHA gate. Cloudflare Turnstile is the default verifier, but the
// only requirement on a caller is that they POST a `turnstileToken` (or the
// standard cf-turnstile-response header). If TURNSTILE_SECRET is unset the whole
// thing is a no-op, so local development, tests and the mobile build all work
// without a token.

export function turnstileEnabled() {
  return Boolean(rateLimits.turnstile.enabled && rateLimits.turnstile.secret);
}

// Returns { ok: true } when disabled or the token verifies; otherwise
// { ok: false, error }.
export async function verifyTurnstileToken(token, ip) {
  if (!turnstileEnabled()) return { ok: true };
  if (!token || typeof token !== 'string') return { ok: false, error: 'missing' };

  const form = new URLSearchParams();
  form.set('secret', rateLimits.turnstile.secret);
  form.set('response', token);
  if (ip) form.set('remoteip', ip);

  try {
    const res = await fetch(rateLimits.turnstile.verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const data = await res.json().catch(() => null);
    return data?.success ? { ok: true } : { ok: false, error: 'invalid' };
  } catch {
    // A verifier that is unreachable must not silently pass; treat it as a
    // failure and let the caller decide how to surface it.
    return { ok: false, error: 'error' };
  }
}

// Reads the token from the body or the Cloudflare response header.
function tokenFrom(req) {
  return req.body?.turnstileToken || req.headers['cf-turnstile-response'] || null;
}

// Middleware for endpoints that always need a token when the feature is on
// (the OTP-send endpoints).
export function requireTurnstile({ message = 'Please complete the human verification and try again.' } = {}) {
  return async function turnstileMiddleware(req, res, next) {
    if (!turnstileEnabled()) return next();
    const result = await verifyTurnstileToken(tokenFrom(req), req.ip);
    if (!result.ok) {
      return next(new HttpError(400, message, { captcha: true, error: 'CAPTCHA_REQUIRED' }));
    }
    return next();
  };
}

export { tokenFrom };
