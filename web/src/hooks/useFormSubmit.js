// Submit lifecycle for form saves that must survive an unruly connection:
//
//   const save = useFormSubmit();
//   const res = await save.run({ method: 'post', path: '/announcements', body });
//   if (!res) { /* inline FormError already on screen; modal stays open */ }
//
// One Idempotency-Key is minted per attempt and reused across retries of that
// attempt, so a request that reached the server but lost its way back is
// replayed rather than run twice. The key rotates only after a success or when
// the caller says a fresh attempt is starting (form reopened/reset). While a
// request is in flight the buttons are disabled, and the inline error the hook
// records drives the "Try again" path without losing the input.
import { useCallback, useRef, useState } from 'react';
import { api } from '../api.js';

export function makeIdempotencyKey() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch { /* fall through */ }
  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch { /* fall through */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

const INLINE_ERROR_KINDS = new Set(['network', 'server']);

export function useFormSubmit() {
  const keyRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // A fresh attempt (form reopened, or a new record) starts from a new key. The
  // old key was scoped to one attempt; reusing it across a reopen would let a
  // stale replay answer a corrected form.
  const resetKey = useCallback(() => { keyRef.current = makeIdempotencyKey(); }, []);

  // `idempotent: false` skips the key entirely. A caller uses it for a full-state
  // PUT that is already idempotent by nature (publishing a whole landing section
  // is "write this exact content"), where a reused key against changed content
  // would only invite a 422. Creates and anything with a side effect keep the key.
  const run = useCallback(async ({ method, path, body, idempotent = true }) => {
    if (idempotent && keyRef.current === null) keyRef.current = makeIdempotencyKey();
    setBusy(true);
    setError(null);
    try {
      const res = await api[method](path, body, idempotent ? { idempotencyKey: keyRef.current } : {});
      if (idempotent) keyRef.current = makeIdempotencyKey(); // success: next attempt is new
      setBusy(false);
      return res;
    } catch (err) {
      setError({
        kind: err.isNetwork ? 'network' : err.status >= 500 ? 'server' : 'validation',
        message: err.message,
        status: err.status,
        // The server body is kept so 4xx handling in a form can route messages to
        // the field that failed (see Reports, whose fields are declared in config).
        details: err.details,
      });
      setBusy(false);
      return null; // handled by FormError / the form's own 4xx handling
    }
  }, []);

  const showInline = error && INLINE_ERROR_KINDS.has(error.kind);
  const showInlineError = () => error && INLINE_ERROR_KINDS.has(error.kind);

  return { busy, error, run, resetKey, showInline: showInlineError() };
}

export default useFormSubmit;