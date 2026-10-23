import './config/tz.js';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pool } from './config/db.js';
import authRoutes from './routes/auth.js';
import beneficiaryRoutes from './routes/beneficiaries.js';
import announcementRoutes from './routes/announcements.js';
import programRoutes from './routes/programs.js';
import trainingRoutes from './routes/trainings.js';
import venueRoutes from './routes/venues.js';
import requestRoutes from './routes/requests.js';
import reportRoutes from './routes/reports.js';
import faqRoutes from './routes/faq.js';
import carouselRoutes from './routes/carousel.js';
import uploadRoutes from './routes/uploads.js';
import landingSectionsRoutes from './routes/landingSections.js';
import chatbotRoutes from './routes/chatbot.js';
import translateRoutes from './routes/translate.js';
import notificationRoutes from './routes/notifications.js';
import calendarRoutes from './routes/calendar.js';
import pushRoutes from './routes/push.js';
import dashboardRoutes from './routes/dashboard.js';
import userRoutes from './routes/users.js';
import publicRoutes from './routes/public.js';
import meRoutes from './routes/me.js';
import homeRoutes from './routes/home.js';
import { authenticatedLimiter, publicDataLimiter } from './middleware/rateLimit.js';
import { simpleCache } from './middleware/simpleCache.js';
import { ensureSchema } from './lib/ensureSchema.js';

dotenv.config();

// This deployment sits behind no proxy, so req.ip must stay the TCP peer address
// and a client-supplied X-Forwarded-For must never be believed. Set TRUST_PROXY
// (e.g. 'loopback', a hop count, or a CIDR list) only once a reverse proxy is
// actually deployed in front; leaving it unset/false is the safe default.
function resolveTrustProxy() {
  const raw = process.env.TRUST_PROXY;
  if (raw === undefined || raw === null || String(raw).trim() === '' || /^false$/i.test(String(raw).trim())) {
    return false;
  }
  const s = String(raw).trim();
  if (/^true$/i.test(s)) return true;
  if (/^\d+$/.test(s)) return Number(s);
  return s;
}

const app = express();
app.set('trust proxy', resolveTrustProxy());

// Credentials are enabled so the landing site's anonymous session cookie can
// round-trip; the origin is reflected rather than '*', which is what browsers
// require once credentials are on. Neither the app nor the portal rely on
// cookies for auth (they use a bearer token).
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '25mb' }));

// Any request carrying a valid token is limited per user id, independent of the
// anonymous public budget and of every other user.
app.use(authenticatedLimiter);

// Anonymous public reads (landing content, FAQs, programs/events)
// share one per-IP budget and a one-minute response cache.
app.use(['/api/public', '/api/faqs'], publicDataLimiter, simpleCache());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'uploads');
app.use('/uploads', express.static(uploadsDir));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'acm-api' }));

app.use('/api/auth', authRoutes);
app.use('/api/beneficiaries', beneficiaryRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/programs', programRoutes);
app.use('/api/trainings', trainingRoutes);
app.use('/api/venues', venueRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/faqs', faqRoutes);
app.use('/api/carousel', carouselRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/landing-sections', landingSectionsRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/translate', translateRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);
app.use('/api/me', meRoutes);
app.use('/api/home', homeRoutes);
// Public, unauthenticated reads for the landing website. CORS (with credentials,
// for the anonymous session cookie) is enabled globally above, and the shared
// public-data limiter + cache are mounted on this prefix earlier, so the site's
// own origin can call it.
app.use('/api/public', publicRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  // Every throttle, wherever it originates (express-rate-limit, or an
  // HttpError(429) thrown by a route's own cooldown check), leaves through the
  // same shape so the clients only ever have to understand one.
  if (status === 429) {
    const retryAfterSeconds = Math.max(
      1,
      Number(err.details?.retryAfterSeconds) || Number(err.details?.retryAfter) || 60
    );
    res.set('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      error: 'RATE_LIMITED',
      message: err.message || 'Too many requests. Please try again later.',
      retryAfterSeconds,
      // Kept for older clients that read `retryAfter`.
      retryAfter: retryAfterSeconds,
    });
  }
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: err.expose !== false ? (err.message || 'Internal server error') : 'Internal server error',
    ...(err.details || {}),
  });
});

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, async () => {
  console.log(`AgriConnect Medina API running on http://${HOST}:${PORT}`);
  // A deploy does not run server/migrations/*.sql, so a database that predates a
  // column (or a seeded knowledge-base row) would only fail later, mid-request.
  // Self-heal the ones the code needs.
  try {
    await ensureSchema();
  } catch (err) {
    console.warn('[warn] schema check failed:', err.message);
  }
  // Admins sign in by mobile number. An account with no mobile set cannot log in
  // through the portal at all, so flag it on startup while it is cheap to fix
  // (User Management > edit > set the number). The check is advisory only.
  try {
    const [rows] = await pool.query(
      "SELECT id, first_name, last_name, email FROM users WHERE role IN ('admin', 'super_admin') AND (mobile_number IS NULL OR mobile_number = '')"
    );
    if (rows.length) {
      const names = rows.map((r) => `${r.first_name || r.last_name || r.email || ''}`.trim() || `id=${r.id}`).join(', ');
      console.warn(`[warn] ${rows.length} admin account(s) have no mobile number and cannot sign in: ${names}`);
    }
  } catch (err) {
    console.warn('[warn] could not check admin mobile numbers:', err.message);
  }
});