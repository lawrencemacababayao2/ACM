import { HttpError } from './utils.js';
import { PUBLIC_TARGET } from './targetTypes.js';

// `show_on_website` is now automatic: true if published AND 'public' is in targets.
// Returns 1 or 0.
export function computeShowOnWebsite(targets, { published, cancelled = false }) {
  if (!published || cancelled) return 0;
  return targets.includes(PUBLIC_TARGET) ? 1 : 0;
}

// "Only the general public" means no registered group is addressed, so SMS has
// nothing to send to. The checkbox is disabled in the form for that case; this
// keeps the stored flag honest for anyone bypassing the form.
export function normalizeSendSms(sendSms, targets) {
  const onlyPublic = targets.length === 1 && targets[0] === PUBLIC_TARGET;
  return onlyPublic ? 0 : (sendSms ? 1 : 0);
}
