import React from 'react';

// Rendered at the top of a form with a live draft. Two messages share the space:
// the reopen case reports the draft that was just restored, and the typing case
// reports the most recent autosave. Both offer "Discard draft" so a user can
// start clean without the stale text fighting back.
function fmtTime(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function DraftNotice({ savedAt, restoredAt, onDiscard }) {
  if (!restoredAt && !savedAt) return null;
  return (
    <div className="draft-notice" role="status">
      <span>
        {restoredAt
          ? `Restored your unsaved draft from ${fmtTime(restoredAt)}.`
          : `Draft saved ${fmtTime(savedAt)}.`}
      </span>
      {onDiscard && (
        <button type="button" className="link-btn" onClick={onDiscard}>
          Discard draft
        </button>
      )}
    </div>
  );
}