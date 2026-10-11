// Draft autosave storage for the admin forms. Every entry is wrapped in
// try/catch because localStorage can throw (private mode at capacity, disabled
// storage), and a draft must never take a form down. Drafts expire after 7 days.
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PREFIX = 'draft:';

// A draft key is scoped to the signed-in user plus the form namespace plus the
// record id ('new' for a create form), so two accounts can never read each
// other's drafts and an interrupted edit resumes exactly where it stopped.
export function draftKey(namespace, userId, id) {
  return `${PREFIX}${namespace}:${userId}:${id}`;
}

// Returns { value, savedAt } or null when absent, unused, or expired.
export function loadDraft(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const savedAt = Number(parsed?.savedAt) || null;
    if (!savedAt || Date.now() - savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return { value: parsed.value, savedAt };
  } catch {
    return null;
  }
}

export function saveDraft(key, value) {
  try {
    const savedAt = Date.now();
    localStorage.setItem(key, JSON.stringify({ value, savedAt }));
    return savedAt;
  } catch {
    return null;
  }
}

export function removeDraft(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

// Called on logout and on session expiry: a user's drafts must not survive into
// the next session on a shared machine.
export function clearAllDrafts() {
  try {
    const doomed = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}