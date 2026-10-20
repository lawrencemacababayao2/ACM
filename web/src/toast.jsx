import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

const ToastCtx = createContext(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

function ToastItem({ t, onClose, onPause, onResume }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`toast ${t.kind} toast-enter`}
      onMouseEnter={onPause}
      onMouseLeave={onResume}
      onClick={onClose}
    >
      <span className="toast-msg">{t.msg}</span>
      <button
        type="button"
        className="toast-close"
        aria-label="Dismiss"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        ×
      </button>
    </div>
  );
}

export function ToastHost({ children }) {
  const [items, setItems] = useState([]);
  const timers = useRef(new Map());
  const idRef = useRef(0);

  const clearTimer = (id) => {
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
  };

  const startTimer = (id, kind) => {
    clearTimer(id);
    const ms = kind === 'err' ? 4000 : 2500;
    const timer = setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== id));
      timers.current.delete(id);
    }, ms);
    timers.current.set(id, timer);
  };

  const push = (msg, kind = 'info', key) => {
    const k = key || `${kind}:${msg}`;
    setItems((prev) => {
      const existing = prev.find((x) => x.key === k);
      if (existing) {
        clearTimer(existing.id);
        const updated = prev.map((x) => (x.key === k ? { ...x, msg, kind, key: k } : x));
        setTimeout(() => startTimer(existing.id, kind), 0);
        return updated;
      }
      const id = ++idRef.current;
      let next = [...prev, { id, msg, kind, key: k }];
      if (next.length > 3) {
        const oldest = next[0];
        clearTimer(oldest.id);
        next = next.slice(1);
      }
      setTimeout(() => startTimer(id, kind), 0);
      return next;
    });
  };

  const remove = (id) => {
    clearTimer(id);
    setItems((prev) => prev.filter((x) => x.id !== id));
  };

  const pause = (id) => {
    clearTimer(id);
  };

  const resume = (id, kind) => {
    startTimer(id, kind);
  };

  useEffect(() => () => { timers.current.forEach((t) => clearTimeout(t)); timers.current.clear(); }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-host">
        {items.map((t) => (
          <ToastItem
            key={t.id}
            t={t}
            onClose={() => remove(t.id)}
            onPause={() => pause(t.id)}
            onResume={() => resume(t.id, t.kind)}
          />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}