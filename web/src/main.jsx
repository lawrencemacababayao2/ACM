import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// Free-text fields capitalise only their first letter ("dela cruz" -> "Dela
// cruz"), not every word. CSS text-transform: capitalize would uppercase the
// start of every word and it cannot target only the first character of a field's
// value, so the transform is done here, on blur.
//
// The value is rewritten through the input's native setter and an `input` event
// is dispatched, so React's controlled onChange picks the change up and what is
// stored matches what is shown. Emails, passwords and every non-text input are
// ignored, and a field can opt out with data-no-capitalize="true".
function isFreeTextField(el) {
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  return (el.getAttribute('type') || 'text').toLowerCase() === 'text';
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
  if (el.dataset.noCapitalize === 'true') return;
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
