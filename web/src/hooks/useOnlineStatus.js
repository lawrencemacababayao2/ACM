// A single connection-status source backing every useOnlineStatus() call, so the
// layout banner and all open forms agree on one answer instead of each running
// its own health check.
//
// The state is a blend of the browser's own online/offline signal and an actual
// round trip to the API: navigator.onLine says "the machine has a network", but
// only a live response says "the MAO server is reachable", which is what saving
// a form actually needs. The health check runs on mount, on visibility gain, on a
// report that a request failed (acm:network-drop from api.js), on any successful
// request (acm:network-ok), and every 15 seconds while the tab is visible.
import { useEffect, useState } from 'react';

const HEALTH_URL = `${(import.meta.env.VITE_API_URL || 'http://localhost:3001/api')}/health`;
const PING_INTERVAL_MS = 15000;
const PING_TIMEOUT_MS = 5000;

const state = { online: navigator.onLine !== false, running: false, listeners: new Set() };
let intervalId = null;

function setOnline(v) {
  if (state.online !== v) {
    state.online = v;
    state.listeners.forEach((fn) => fn(v));
  }
}

async function pingHealth() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const res = await fetch(HEALTH_URL, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// One shared pinger, started on first use, shared by every subscriber.
function ensureRunning() {
  if (state.running) return;
  state.running = true;

  const check = async () => { setOnline(await pingHealth()); return state.online; };
  const immediate = () => { void check(); };
  const goOffline = () => setOnline(false);

  void immediate();
  window.addEventListener('online', immediate);            // machine network back
  window.addEventListener('offline', goOffline);           // machine network gone
  window.addEventListener('acm:network-drop', goOffline);  // a request failed
  window.addEventListener('acm:network-ok', immediate);    // a request succeeded
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void check(); });

  intervalId = setInterval(() => {
    if (document.visibilityState !== 'hidden') void check();
  }, PING_INTERVAL_MS);
}

export function useOnlineStatus() {
  const [online, setSubscribed] = useState(state.online);

  useEffect(() => {
    ensureRunning();
    const listener = (value) => setSubscribed(value);
    state.listeners.add(listener);
    setSubscribed(state.online); // pick up a change made before subscribing
    return () => { state.listeners.delete(listener); };
  }, []);

  return online;
}

export default useOnlineStatus;