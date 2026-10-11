import React from 'react';

// Inline failure block for form submits, rendered inside the form so the user's
// input stays visible and intact. Retry re-submits the same payload with the same
// Idempotency-Key, which the server either replays (the earlier request actually
// landed) or runs (it never did). Nothing here touches the values on screen.
export function FormError({ error, onRetry }) {
  if (!error || error.kind === 'validation') return null;
  const message = error.kind === 'network' || error.isTimeout
    ? "Couldn't reach the server. Your input is saved on this computer."
    : 'Something went wrong on our side. Please try again.';
  return (
    <div className="form-error" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn sm" onClick={onRetry}>Try again</button>
      )}
      <em className="muted">{error.message}</em>
    </div>
  );
}

/* eslint-disable-next-line import/no-anonymous-default-export */
export default FormError;