import React, { useState } from 'react';
import Icon from './Icon.jsx';
import { PASSWORD_MAX_LENGTH } from '../lib/password.js';

// A password input with a show/hide toggle. The value, validation and messages
// stay with the form; this only owns the reveal state so the eye button cannot
// leak a password into the shared form state.
export default function PasswordInput({
  value,
  onChange,
  onFocus,
  onBlur,
  placeholder,
  autoComplete = 'new-password',
  invalid = false,
  ...rest
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="password-input">
      <input
        type={revealed ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        autoComplete={autoComplete}
        maxLength={PASSWORD_MAX_LENGTH}
        aria-invalid={invalid || undefined}
        {...rest}
      />
      <button
        type="button"
        className="password-toggle"
        aria-label={revealed ? 'Hide password' : 'Show password'}
        aria-pressed={revealed}
        tabIndex={-1}
        onClick={() => setRevealed((v) => !v)}
      >
        <Icon name={revealed ? 'eyeOff' : 'eye'} size={15} />
      </button>
    </div>
  );
}
