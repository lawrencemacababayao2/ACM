import React, { useEffect, useRef, useState } from 'react';
import useOnlineStatus from '../hooks/useOnlineStatus.js';

// The persistent amber banner while the API is unreachable, and the brief green
// "back online" acknowledgement on the way back up. aria-live="polite" keeps the
// announcement from interrupting keyboard users mid-task; reading and browsing
// are never blocked by the banner, only form submits reflect the state.
export default function ConnectionBanner() {
  const online = useOnlineStatus();
  const [reconnected, setReconnected] = useState(false);
  const prevRef = useRef(online);
  const timerRef = useRef(null);

  useEffect(() => {
    if (online && !prevRef.current) {
      setReconnected(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setReconnected(false), 3000);
    } else {
      setReconnected(false);
    }
    prevRef.current = online;
    return () => clearTimeout(timerRef.current);
  }, [online]);

  if (online && !reconnected) return null;

  return (
    <div className={`conn-banner${online ? ' ok' : ' off'}`} role="status" aria-live="polite">
      {online
        ? 'Back online. Your connection to the server is restored.'
        : 'No internet connection. Your changes are not being saved to the server. Drafts are kept on this computer.'}
    </div>
  );
}