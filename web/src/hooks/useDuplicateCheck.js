// Live, debounced inline duplicate preview for a form.
//
//   const { errors, checking, reset, run, check } = useDuplicateCheck({
//     endpoint: '/beneficiaries/check-duplicate',
//     params: { first_name, last_name, mobile_number, ... },
//     enabled: showEdit,
//   });
//
// `errors` is an array of { field, message } - one entry per conflicting input -
// so the form can show each message next to the field it belongs to instead of a
// single banner. The field names are the same ones the server uses in a 409
// DUPLICATE_BLOCK response, so the blur-time preview and the submit-time error
// are routed by identical rules. The check runs whenever `params` settle for
// `debounceMs`, so typing does not hammer the API and only the most recent
// request is allowed to land.
//
// Fields listed in `blurFields` are deliberately excluded from that change-driven
// flow: editing them clears any pending verdict so a stale error cannot linger,
// but a request only fires when the form calls `check()` from a blur handler.
// Everything else waits `debounceMs` after the last keystroke, which is the
// behaviour the name fields rely on.
//
// `run` fires a debounced check on demand (used when leaving a field without
// changing anything); `check` fires immediately. `reset` clears the state and
// drops any in-flight check (used when a second form could be opened).
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

function onlyBlurFieldsChanged(prevKey, nextKey, blurFields) {
  if (!blurFields.length) return false;
  if (prevKey === nextKey) return false;
  let prev = null;
  let next = null;
  try { prev = JSON.parse(prevKey); } catch { return false; }
  try { next = JSON.parse(nextKey); } catch { return false; }
  if (!prev || !next) return false;
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  let changed = false;
  for (const key of keys) {
    if (prev[key] === next[key]) continue;
    if (!blurFields.includes(key)) return false;
    changed = true;
  }
  return changed;
}

export function useDuplicateCheck({ endpoint, params, enabled = true, debounceMs = 400, blurFields = [] }) {
  const [errors, setErrors] = useState([]);
  const [checking, setChecking] = useState(false);
  const timerRef = useRef(null);
  const seqRef = useRef(0);
  // The latest values are read at fire time so the effect can depend on the
  // stringified params without closing over a stale copy.
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const blurFieldsRef = useRef(blurFields);
  blurFieldsRef.current = blurFields;

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

  const run = useCallback((immediate = false) => {
    clearTimer();
    const p = paramsRef.current;
    if (!enabledRef.current || !p || typeof p !== 'object' || Object.keys(p).length === 0) {
      seqRef.current += 1;
      setErrors([]);
      setChecking(false);
      return;
    }
    const token = ++seqRef.current;
    setErrors([]);
    const fire = async () => {
      setChecking(true);
      try {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(p)) {
          if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
        }
        const res = await api.get(endpoint + (qs.toString() ? `?${qs.toString()}` : ''));
        if (token !== seqRef.current) return;
        setErrors(Array.isArray(res?.errors) ? res.errors : []);
      } catch (err) {
        // A failed preview only hides the inline messages: the authoritative
        // check still happens server-side on submit, so this never weakens the
        // rule.
        if (token !== seqRef.current) return;
        setErrors([]);
      } finally {
        if (token === seqRef.current) setChecking(false);
      }
    };
    if (immediate) void fire();
    else timerRef.current = setTimeout(() => { void fire(); }, debounceMs);
  }, [endpoint, debounceMs]);

  const reset = useCallback(() => {
    seqRef.current += 1;
    clearTimer();
    setErrors([]);
    setChecking(false);
  }, []);

  const fullKey = JSON.stringify(params ?? null);
  const prevKeyRef = useRef(fullKey);
  useEffect(() => {
    const prevKey = prevKeyRef.current;
    prevKeyRef.current = fullKey;
    if (!enabledRef.current) { reset(); return; }
    // A run that only touched a blur-checked field clears the old verdict so a
    // stale error cannot stick around, but the network check is deferred to the
    // blur handler.
    if (onlyBlurFieldsChanged(prevKey, fullKey, blurFieldsRef.current)) {
      seqRef.current += 1;
      clearTimer();
      setErrors([]);
      setChecking(false);
      return;
    }
    run();
  }, [fullKey, run, reset]);

  return { errors, checking, reset, run: () => run(false), check: () => run(true) };
}

export default useDuplicateCheck;
