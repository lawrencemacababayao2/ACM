import crypto from 'node:crypto';
import rateLimits from '../config/rateLimits.js';

// Anonymous visitors on the public landing site have no account, so they are
// identified by IP plus a random session cookie. The cookie value is an opaque
// random id: it carries no name, email, phone or any personal data, and it is
// only ever used as a rate-limit key. If cookies are blocked the visitor simply
// falls back to being keyed by IP alone (see anonKey), which is why nothing here
// may assume the cookie round-trips.
//
// The cookie is HttpOnly (page scripts cannot read it) and SameSite=Lax by
// default, with Secure/domain configurable for a real deployment.

const { name: COOKIE_NAME, maxAgeSeconds, sameSite, secure, domain } = rateLimits.anonCookie;

// base64url of 18 random bytes = 24 URL-safe characters, plenty of entropy to
// make guessing another visitor's id impractical.
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

// Minimal Cookie header parser. Added rather than pulling in cookie-parser,
// because one header is the only thing this feature needs.
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    if (!key) continue;
    let value = part.slice(eq + 1).trim();
    try { value = decodeURIComponent(value); } catch { /* keep raw on bad escape */ }
    out[key] = value;
  }
  return out;
}

export function anonSession(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  let id = cookies[COOKIE_NAME];
  // Whether the visitor actually returned the cookie we handed out. A quota keyed
  // by the id only survives a round-trip; without one the caller falls back to
  // being counted by IP, so clearing the cookie cannot reset a daily allowance.
  const persisted = ID_RE.test(id || '');
  if (!persisted) {
    id = crypto.randomBytes(18).toString('base64url');
    const bits = [
      `${COOKIE_NAME}=${id}`,
      'Path=/',
      `Max-Age=${maxAgeSeconds}`,
      'HttpOnly',
      `SameSite=${sameSite}`,
    ];
    if (secure) bits.push('Secure');
    if (domain) bits.push(`Domain=${domain}`);
    res.append('Set-Cookie', bits.join('; '));
  }
  // Read by the anonymous key functions; never trusted for anything else.
  req.anon = { id, persisted };
  return next();
}

// Where a request cannot be tied to a signed-in user, this is the identity used
// for its budget: IP plus the anonymous session when the cookie came back, or
// just the IP when it did not.
export function anonKey(req) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const id = req.anon?.id;
  return id ? `${ip}|${id}` : ip;
}

export { parseCookies };
