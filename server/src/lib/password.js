// The single definition of "an acceptable password" for the API.
//
// The mobile app (mobile/src/validation.js) and the web portal
// (web/src/lib/password.js) keep a deliberate copy of these same three rules so
// every form can validate without a round trip; the API is still the authority
// and re-checks every password before hashing it. The rule set is intentionally
// tiny and stable: at least 8 characters and at most 20, with a letter and a
// number.

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 20;

// Each rule carries an id the UI maps to a label. The API only needs the verdict,
// but keeping the same shape everywhere is what lets the checklist stay in step.
export const PASSWORD_RULES = [
  { id: 'length', test: (v) => String(v ?? '').length >= PASSWORD_MIN_LENGTH },
  { id: 'max', test: (v) => String(v ?? '').length <= PASSWORD_MAX_LENGTH },
  { id: 'letter', test: (v) => /[A-Za-z]/.test(String(v ?? '')) },
  { id: 'number', test: (v) => /\d/.test(String(v ?? '')) },
];

/**
 * @returns {'required'|'tooShort'|'tooLong'|'weak'|null}
 */
export function passwordReason(value) {
  const v = String(value ?? '');
  if (!v) return 'required';
  if (v.length < PASSWORD_MIN_LENGTH) return 'tooShort';
  if (v.length > PASSWORD_MAX_LENGTH) return 'tooLong';
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return 'weak';
  return null;
}

/** The human-readable message for a password problem, or null when it is fine. */
export function passwordProblem(value) {
  const reason = passwordReason(value);
  if (reason === 'required') return 'Password is required';
  if (reason === 'tooShort') return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  if (reason === 'tooLong') return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  if (reason === 'weak') return 'Password must contain both letters and numbers';
  return null;
}

/** @returns {null} when the confirmation matches, otherwise 'mismatch' */
export function passwordMatchReason(password, confirmation) {
  return password === confirmation ? null : 'mismatch';
}
