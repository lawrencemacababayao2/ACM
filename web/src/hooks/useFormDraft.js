// Per-form local draft autosave for the admin screens.
//
  //   useFormDraft('announcement', editing?.id ?? 'new', form, {
  //     user: api.user(),
  //     enabled: open,
  //     exclude: [],          // keys never written to storage (passwords, tokens)
  //     onRestore: (v) => setForm(v),
  //   })
  //
  // While a form is open its values are debounced to localStorage under a
  // per-user, per-record key (draft:announcement:12:new), so an interrupted
  // session (power cut, closed tab, crash) loses nothing. Reopening the form
  // restores the draft through onRestore and a notice reports it; a successful
  // save or an explicit discard clears it.
  import { useCallback, useEffect, useRef, useState } from 'react';
  import { draftKey, loadDraft, removeDraft, saveDraft } from '../lib/draftStore.js';
  import { useToast } from '../toast.jsx';

  const DEBOUNCE_MS = 500;

  function pick(value, exclude) {
    if (!exclude || exclude.length === 0) return value;
    const out = { ...value };
    for (const k of exclude) delete out[k];
    return out;
  }

  export function useFormDraft(namespace, id, value, { user, enabled = true, exclude = [], onRestore } = {}) {
    const toast = useToast();
    const key = id != null && user?.id != null ? draftKey(namespace, user.id, id) : null;
    const [savedAt, setSavedAt] = useState(null);
    const [restoredAt, setRestoredAt] = useState(null);
    const clearedRef = useRef(false);
    const baselineRef = useRef(null);
    const onRestoreRef = useRef(onRestore);
    useEffect(() => { onRestoreRef.current = onRestore; });

    // Opening a form (or switching records) resumes the draft it left behind. The
    // untouched value is remembered as the baseline: autosave and the
    // "unsaved changes" prompt are only meaningful once the form differs from it,
    // so a form that was opened and closed without typing anything stays clean.
    useEffect(() => {
      if (!key || !enabled) return;
      if (clearedRef.current) {
        clearedRef.current = false;
        baselineRef.current = pick(value, exclude);
        return;
      }
      const stored = loadDraft(key);
      if (stored && typeof onRestoreRef.current === 'function') {
        onRestoreRef.current(stored.value);
        setRestoredAt(stored.savedAt);
        setSavedAt(stored.savedAt);
        baselineRef.current = stored.value;
      } else {
        setRestoredAt(null);
        baselineRef.current = pick(value, exclude);
      }
    }, [key, enabled]);

    // Debounced autosave of whatever the form currently holds. Values equal to
    // the opening baseline are never written: no net edits means no draft, and no
    // draft means closing the form never asks about unsaved changes.
    useEffect(() => {
      if (!key || !enabled || clearedRef.current || value == null) return undefined;
      const timer = setTimeout(() => {
        const next = pick(value, exclude);
        const baseline = baselineRef.current == null ? null : pick(baselineRef.current, exclude);
        if (baseline != null && JSON.stringify(next) === JSON.stringify(baseline)) {
          if (key) removeDraft(key);
          setSavedAt(null);
          setRestoredAt(null);
          return;
        }
        const at = saveDraft(key, next);
        if (at) setSavedAt(at);
      }, DEBOUNCE_MS);
      return () => clearTimeout(timer);
    }, [key, enabled, value, exclude]);

    // Drafts autosave continuously; no beforeunload prompt needed.
    // When the form closes cleanly (save or explicit discard), the draft is cleared.
    // If the tab is closed unexpectedly, the draft persists and will be restored on next open.
    // A toast 'Draft kept' is shown when the draft is explicitly cleared.

    const clear = useCallback(() => {
      clearedRef.current = true;
      if (key) removeDraft(key);
      setSavedAt(null);
      setRestoredAt(null);
      toast('Draft kept', 'ok');
    }, [key]);

    return { savedAt, restoredAt, clear };
  }

export default useFormDraft;