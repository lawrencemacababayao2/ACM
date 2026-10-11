// Target beneficiary selection rules, kept free of JSX so the rules can be unit
// tested directly and so every page agrees on them.
//
// This mirrors server/src/lib/targetTypes.js. The two must stay in step: the
// server rejects an empty list and collapses 'All', so a form that could reach a
// state the API refuses would surface as a save error instead of a validation
// message.

export const ALL = 'all';

export const BEN_TYPES = ['farmer', 'fisherfolk', 'livestock_owner'];
export const PUBLIC = 'public';

// Everything the API accepts, in the order it is stored. 'public' sits after the
// registered groups because it is an audience *addition* (walk-ins, site
// visitors) rather than one of them, so ticking it never re-orders the rest.
export const TARGET_ORDER = [...BEN_TYPES, PUBLIC];

// Form options: registered groups + General Public (mutually exclusive)
export const FORM_TARGET_OPTIONS = [
  { value: 'farmer', label: 'Farmer' },
  { value: 'fisherfolk', label: 'Fisherfolk' },
  { value: 'livestock_owner', label: 'Livestock Owner' },
  { value: 'public', label: 'General Public' },
];

// Filter options: includes an "All target groups" option that clears the filter.
export const FILTER_TARGET_OPTIONS = [
  { value: '', label: 'All target groups' },
  { value: 'farmer', label: 'Farmer' },
  { value: 'fisherfolk', label: 'Fisherfolk' },
  { value: 'livestock_owner', label: 'Livestock Owner' },
  { value: 'public', label: 'Open to everyone' },
];

// Announcement filter options: same as FILTER_TARGET_OPTIONS but without 'public'
export const ANNOUNCEMENT_FILTER_OPTIONS = FILTER_TARGET_OPTIONS.filter((o) => o.value !== 'public');

export function normalizeTypes(value) {
  let raw = value;
  // Handle JSON string from database (e.g., '["farmer"]')
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) raw = parsed;
    } catch {
      // Not JSON, treat as legacy value
    }
  }
  raw = Array.isArray(raw) ? raw : raw == null || raw === '' ? [] : [raw];
  const strings = raw.map((x) => String(x ?? '').trim());
  const wantsPublic = strings.includes(PUBLIC);
  const picked = new Set(strings.filter((x) => BEN_TYPES.includes(x)));
  // 'all_registered' and 'all' both mean all registered groups
  const hasAll = strings.includes(ALL) || strings.includes('all_registered');
  const base = hasAll ? [ALL] : BEN_TYPES.filter((t) => picked.has(t));
  if (!base.length && !wantsPublic) return [];
  return wantsPublic ? [...base, PUBLIC] : base;
}

// Whether the audience includes the general public, i.e. people who are not
// registered beneficiaries. Drives the website toggle default and the SMS note
// that tells the admin only registered groups are messaged.
export function includesPublic(selected) {
  return normalizeTypes(selected).includes(PUBLIC);
}

// Applies a checkbox tick to the current selection.
//
// Returns the next selection, or the current one when the change would be
// invalid. The rules that matter here:
//
//  - 'all' (every registered beneficiary) is MUTUALLY EXCLUSIVE with the
//    specific registered groups: ticking 'all' clears them, ticking a group
//    clears 'all'. This is what makes Announcements' "All" selectable alongside
//    the groups instead of swallowing them.
//  - 'public' (General Public) is MUTUALLY EXCLUSIVE with registered groups.
//    Ticking 'public' clears all registered groups (and 'all'), and vice versa.
//  - The last type cannot be unticked (would reach nobody).
export function toggleTypes(selected, value) {
  const current = normalizeTypes(selected);
  const v = String(value ?? '').trim();
  const hasPublic = current.includes(PUBLIC);
  const hasAll = current.includes(ALL);

  if (v === ALL) return hasAll ? current : [ALL];

  if (v === PUBLIC) {
    if (hasPublic) {
      const next = current.filter((t) => t !== PUBLIC);
      return next.length ? next : current;
    }
    // Public is mutually exclusive - clear all registered groups and 'all'
    return [PUBLIC];
  }
  if (!BEN_TYPES.includes(v)) return current;
  // A registered group is mutually exclusive with both 'all' and public
  if (hasAll || hasPublic) return [v];

  const next = current.includes(v) ? current.filter((t) => t !== v) : [...current, v];
  return next.length ? normalizeTypes(next) : current;
}

export function removeType(selected, value) {
  const current = normalizeTypes(selected);
  if (current.length <= 1) return current;
  return toggleTypes(current, value);
}