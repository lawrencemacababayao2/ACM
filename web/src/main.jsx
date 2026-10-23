import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// Free-text fields capitalise only their first letter ("dela cruz" -> "Dela
// cruz"), not every word. CSS text-transform: capitalize would uppercase the
// start of every word and it cannot target only the first character of a field's
// value, so the transform is done here, on blur.
//
// Formatting is opt-in: a field must carry data-capitalize="true" to be
// formatted. Nothing is formatted just because it is a text input, so
// credentials, identifiers, search boxes and other sensitive values are never
// rewritten. A field can also opt out with data-no-format="true" or
// data-sensitive="true".
const SENSITIVE_FIELD = /password|passcode|email|phone|mobile|username|user|otp|pin|secret|token|sms/i;

function isFreeTextField(el) {
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  return (el.getAttribute('type') || 'text').toLowerCase() === 'text';
}

function wantsCapitalize(el) {
  if (el.dataset.capitalize !== 'true') return false;
  if (el.dataset.noFormat === 'true' || el.dataset.sensitive === 'true') return false;
  if (el.dataset.noCapitalize === 'true') return false;
  if ((el.getAttribute('type') || '').toLowerCase() === 'password') return false;
  if (el.closest && el.closest('.password-input')) return false;
  const name = el.getAttribute('name') || '';
  const id = el.getAttribute('id') || '';
  if (SENSITIVE_FIELD.test(name) || SENSITIVE_FIELD.test(id)) return false;
  return true;
}

function setNativeValue(el, value) {
  const proto = el.tagName === 'TEXTAREA'
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, value);
}

document.addEventListener('focusout', (event) => {
  const el = event.target;
  if (!el || !isFreeTextField(el) || el.disabled || el.readOnly) return;
  if (!wantsCapitalize(el)) return;
  const value = el.value;
  if (!value) return;
  const upper = value.charAt(0).toUpperCase();
  if (value.charAt(0) === upper) return;
  setNativeValue(el, upper + value.slice(1));
  el.dispatchEvent(new Event('input', { bubbles: true }));
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
