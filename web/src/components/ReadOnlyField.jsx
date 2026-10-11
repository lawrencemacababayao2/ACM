import React from 'react';
import Icon from './Icon.jsx';

// A field whose value the current user is not allowed to change. It shows the real
// value in a disabled-looking box with a lock on the right and the reason spelled
// out beneath, rather than a control that silently ignores clicks -- the same
// label and hint rhythm as a Field, so it lines up with the editable fields beside
// it in the form.
export default function ReadOnlyField({ label, value, helper, col2 }) {
  return (
    <div className={`field ${col2 ? 'col-2' : ''}`}>
      {label != null && <span className="field-label">{label}</span>}
      <div className="readonly-field">
        <span className="readonly-field-value">{value}</span>
        <Icon name="lock" size={15} className="readonly-field-lock" />
      </div>
      {helper && <small className="hint">{helper}</small>}
    </div>
  );
}