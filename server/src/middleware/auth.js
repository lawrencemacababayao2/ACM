import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret';

// Roles that reach the admin web portal. Beneficiary accounts live in the same
// table but sign in through the mobile app, and is_active only tracks the admin
// accounts that User Management is allowed to switch on and off.
export const ADMIN_ROLES = ['admin', 'super_admin'];

export function sign(payload, options = {}) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d', ...options });
}

export function verify(token, options = {}) {
  return jwt.verify(token, SECRET, options);
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

// A token stays valid for 7 days, so a demotion or a deactivation would otherwise
// be ignored by any session issued before it: the role baked into the JWT still
// says "admin", and there is no other check. Re-reading the row on every request
// makes both take effect on the very next call instead of up to a week later,
// which is what User Management promises when an account is switched off.
//
// `required` separates auth() from optionalAuth(). The optional variant treats an
// unusable token as no token at all and carries on anonymously, the way a public
// page should, rather than converting it into a 401 or 403.
async function attachAccount(req, res, next, { required }) {
  const token = bearerToken(req);
  if (!token) {
    if (!required) return next();
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let claims;
  try {
    claims = jwt.verify(token, SECRET);
  } catch {
    if (!required) return next();
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  let account = null;
  try {
    const [rows] = await pool.query(
      'SELECT id, email, role, is_active, token_version FROM users WHERE id = ? LIMIT 1',
      [claims.id]
    );
    account = rows[0] || null;
  } catch (err) {
    // A database hiccup must not quietly downgrade a signed-in request to an
    // anonymous one, so a required request surfaces the error and an optional one
    // falls back to anonymous.
    if (required) return next(err);
    return next();
  }

  if (!account) {
    if (!required) return next();
    return res.status(401).json({ error: 'Account no longer exists' });
  }

  // A password change (admin reset or the mobile forgot-password flow) bumps
  // users.token_version, which here makes every older JWT unsignable even though
  // it is still cryptographically valid. Tokens issued before token_version
  // existed carried no `tv` and are treated as version 0, so existing sessions
  // keep working until the account's password actually changes.
  const tokenVersion = claims.tv || 0;
  if (tokenVersion !== account.token_version) {
    if (!required) return next();
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  if (!account.is_active && ADMIN_ROLES.includes(account.role)) {
    if (!required) return next();
    return res.status(403).json({ error: 'This account has been deactivated. Please contact a Super Admin.' });
  }

  // The row is the source of truth for the role, not the token that carried it.
  req.user = { id: account.id, email: account.email, role: account.role };
  return next();
}

export function auth(req, res, next) {
  return attachAccount(req, res, next, { required: true });
}

export function optionalAuth(req, res, next) {
  return attachAccount(req, res, next, { required: false });
}

export function roles(...allowed) {
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

// A Super Admin is an Admin plus the account screens, so every module gate has to
// name both roles. Listing only 'admin' here would lock Super Admins out of the
// very portal they are meant to administer.
export const adminOnly = roles('admin', 'super_admin');

export const superAdminOnly = roles('super_admin');