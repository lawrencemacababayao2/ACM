// Shared "point at the problem" behaviour for every form.
//
// When a submit is refused because of inline field errors, a toast is the wrong
// affordance: it disappears, it names no field, and the offending input may be
// scrolled out of view. Instead the first inline error is brought to the middle
// of the viewport and its control is focused, so the click never looks ignored
// and the user is taken straight to what needs fixing.
//
// React renders the error spans after the state update that records them, so
// callers use the deferred variant (or wrap the call in setTimeout themselves).
function resolveRoot(root) {
  const value = typeof root === 'function' ? root() : root;
  if (value) return value;
  return document.querySelector('.modal-body') || document;
}

export function revealFirstFieldError(root, message) {
  const scope = resolveRoot(root);
  const errors = Array.from(scope.querySelectorAll('.error'));
  if (errors.length === 0) return false;

  const wanted = message == null ? '' : String(message).trim();
  const target = (wanted && errors.find((el) => el.textContent.trim() === wanted)) || errors[0];

  target.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Focus the control that owns the message. A Field wrapper carries the error
  // class itself, so `closest` may return that wrapper; either way the first
  // focusable control inside it is the one the user has to change.
  const field = target.closest('.field') || target.parentElement;
  const control = field?.querySelector(
    'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [role="combobox"]',
  );
  control?.focus?.({ preventScroll: true });
  return true;
}

export function revealFirstFieldErrorSoon(root, message) {
  return setTimeout(() => revealFirstFieldError(root, message), 60);
}
