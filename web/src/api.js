import { clearAllDrafts } from './lib/draftStore.js';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const REQUEST_TIMEOUT_MS = 60000;

// Origin that serves uploaded files (BASE without the trailing /api). Relative
// "/uploads/..." paths are turned into full URLs for <img>/links; data: and
// absolute URLs are passed through untouched.
const API_ORIGIN = BASE.replace(/\/api\/?$/, '');
export function mediaUrl(path) {
  if (!path) return null;
  const value = String(path);
  if (/^(data:|https?:|blob:)/i.test(value)) return value;
  return API_ORIGIN + (value.startsWith('/') ? value : `/${value}`);
}

function getToken() {
  return localStorage.getItem('acm_token');
}

// A request that could not complete (no network, server down, firewall) never
// yields an HTTP status: fetch either rejects or is abandoned when the timeout
// aborts it. Both are reported as a network-level error with `isNetwork`, which
// the form layer turns into the inline "Couldn't reach the server" message.
function networkError(message, isTimeout) {
  const err = new Error(message);
  err.status = 0;
  err.isNetwork = true;
  if (isTimeout) err.isTimeout = true;
  return err;
}

async function request(path, { method = 'GET', body, headers, idempotencyKey } = {}) {
  const token = getToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(BASE + path, {
      method,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    // Reaching the server at all proves connectivity; a 5xx still means the API
    // was up, so the connection banner can come back immediately.
    window.dispatchEvent(new Event('acm:network-ok'));
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (res.status === 401) {
      // A 401 here means one of two unrelated things, and they must not be
      // reported the same way:
      //   * on /auth/* the sign-in itself was rejected, so the server says why,
      //     e.g. "Invalid account or password"
      //   * anywhere else a token we already held was refused, so the session
      //     really did expire
      // Only the second one is a session expiry. Treating every 401 as one threw
      // away the server's reason, so a wrong password was reported as "Session
      // expired" on the very screen used to type it, which hid the cause.
      if (path.startsWith('/auth/')) {
        // The stored session is left alone: failing to sign in is not a reason to
        // discard one that may still be valid.
        const err = new Error(data?.error || 'Invalid account or password');
        err.status = res.status;
        err.details = data;
        throw err;
      }
      // A forced logout, so the next user on a shared machine must not inherit
      // the previous session's drafts either.
      clearAllDrafts();
      localStorage.removeItem('acm_token');
      localStorage.removeItem('acm_user');
      if (location.pathname !== '/login') location.href = '/login';
      throw new Error('Session expired');
    }
    if (!res.ok) {
      // The error handler merges HttpError `details` into the top-level body, so a
      // validation error names its input as `data.field`. The whole body is kept on
      // the Error (rather than flattened into just the message) so forms can route
      // the message to the right field and callers can read `status`.
      // `message` is preferred over `error` because a rate-limit body is
      // { error: "RATE_LIMITED", message, retryAfterSeconds }.
      const err = new Error(data?.message || data?.error || 'Request failed');
      err.status = res.status;
      err.code = data?.error;
      err.details = data && typeof data === 'object' ? data : null;
      if (res.status === 429) {
        const header = Number(res.headers.get('Retry-After'));
        err.retryAfterSeconds =
          Number(data?.retryAfterSeconds) || Number(data?.retryAfter) ||
          (Number.isFinite(header) ? header : undefined) || undefined;
      }
      throw err;
    }
    return data;
  } catch (err) {
    // Timeouts and network drops both report a connection problem and nudge the
    // online checker so the amber banner appears promptly instead of at the next
    // 15-second tick.
    if (err.name === 'AbortError' || (typeof err.isNetwork === 'undefined' && !err.status)) {
      if (err.name === 'AbortError') throw networkError('Request timed out', true);
      throw networkError("Couldn't reach the server", false);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  get: (path) => request(path),
  post: (path, body, options = {}) => request(path, { method: 'POST', body, ...options }),
  put: (path, body, options = {}) => request(path, { method: 'PUT', body, ...options }),
  patch: (path, body, options = {}) => request(path, { method: 'PATCH', body, ...options }),
  del: (path) => request(path, { method: 'DELETE' }),

  async login(mobile, password) {
    const data = await request('/auth/login', { method: 'POST', body: { mobile, password } });
    localStorage.setItem('acm_token', data.token);
    localStorage.setItem('acm_user', JSON.stringify(data.user));
    return data.user;
  },

  logout() {
    // A sign-out discards this browser's drafts so nothing personal is left
    // behind for the next person on the machine.
    clearAllDrafts();
    localStorage.removeItem('acm_token');
    localStorage.removeItem('acm_user');
  },

  user() {
    try {
      return JSON.parse(localStorage.getItem('acm_user') || 'null');
    } catch {
      return null;
    }
  },

  setUser(user) {
    localStorage.setItem('acm_user', JSON.stringify(user || 'null'));
    window.dispatchEvent(new Event('acm:user-updated'));
  },

  async download(path, filename) {
    const token = getToken();
    const res = await fetch(BASE + path, { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};

export default api;