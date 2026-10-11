import React, { useId } from 'react';

export default function Field({ label, children, col2, required, optional, hint, error }) {
  // The wrapper is a plain div, not a <label>: a block-level label hands a click
  // on any blank space in the row to its first labelable control, which is the
  // oversized-click-area bug this audit exists to kill. The label text itself
  // stays a real <label> so clicking it (or tabbing to it) still focuses the
  // control, wired up by matching the generated id onto the first child.
  const controlId = useId();
  const rendered = React.Children.toArray(children).map((child, i) =>
    i === 0 && React.isValidElement(child)
      ? React.cloneElement(child, { id: controlId })
      : child
  );

  return (
    <div className={`field ${col2 ? 'col-2' : ''} ${error ? 'error' : ''}`.trim()}>
      {/* Required fields are left unmarked; optional is spelled out, because on a
          twelve-field form an unmarked control reads as mandatory and silently
          blocks submit. */}
      {label != null && (
        <label className="field-label" htmlFor={controlId}>
          {label}{optional ? ' (optional)' : ''}
        </label>
      )}
      {rendered}
      {hint && <small className="hint">{hint}</small>}
    </div>
  );
}