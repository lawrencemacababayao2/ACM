import { HttpError } from './utils.js';

// A post can now target several kinds of beneficiary at once, so the target is a
// list rather than one enum value. It lives in `target_beneficiary_types`, a JSON
// array column.
//
// `target_type` is kept alongside it as a *derived* column, because the mobile app,
// the calendar feed and the chatbot all read that single value and have no notion
// of a list. It is never read as the source of truth: see `legacyTargetType`.
export const BENEFICIARY_TYPES = ['farmer', 'fisherfolk', 'livestock_owner'];
export const PUBLIC_TARGET = 'public';
export const ALL_TARGET = 'all';
export const VALID_TARGET_TYPES = [...BENEFICIARY_TYPES, PUBLIC_TARGET];

// Accepts what the request body actually contains and returns a clean array.
// Tolerates a bare string so an older client (or a hand-made curl) sending
// `target_type: "farmer"` keeps working instead of being silently dropped.
//
// 'all' is exclusive with the three registered groups: it means "every verified
// beneficiary", so a list carrying it collapses the registered half to ['all'].
// 'public' is MUTUALLY EXCLUSIVE with registered groups: it means general public
// (walk-ins, site visitors), so it cannot be combined with registered groups.
// If 'public' is present, registered groups are dropped. If registered groups
// are present, 'public' is dropped. Order stays stable: registered groups first,
// 'public' last.
//
// Returns [] only when the caller named nothing at all, which `requireTargetTypes`
// turns into a 400 rather than defaulting to everyone.
export function normalizeTargetTypes(input) {
  const raw = Array.isArray(input)
    ? input
    : input === undefined || input === null || input === ''
      ? []
      : [input];

  const strings = raw.map((v) => String(v ?? '').trim());
  const wantsPublic = strings.includes(PUBLIC_TARGET);
  const picked = new Set(strings.filter((v) => BENEFICIARY_TYPES.includes(v)));
  const wantsAll = strings.includes(ALL_TARGET);

  // Mutual exclusivity: public and registered groups cannot coexist
  let base;
  if (wantsPublic) {
    // Public selected - ignore registered groups and 'all'
    base = [];
  } else if (wantsAll) {
    base = [ALL_TARGET];
  } else {
    base = BENEFICIARY_TYPES.filter((t) => picked.has(t));
  }

  if (!base.length && !wantsPublic) return [];
  return wantsPublic ? [...base, PUBLIC_TARGET] : base;
}

// Reading side. A row written before this change has no JSON column, and a JSON
// column can come back from the driver as an array or as a string depending on
// version, so both are handled. An absent or unusable value falls back to the
// legacy column so old rows keep the audience they always had.
export function readTargetTypes(row) {
  if (!row) return [];
  const raw = row.target_beneficiary_types ?? row.targetBeneficiaryTypes;
  if (Array.isArray(raw)) return normalizeTargetTypes(raw);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return normalizeTargetTypes(JSON.parse(raw));
    } catch {
      // Not JSON after all; fall through to the legacy column.
    }
  }
  return normalizeTargetTypes(row.target_type);
}

// Reading side for the `notified_types` JSON column: the target types a post
// has already been announced to. Used on republish so only the newly added
// types get a fresh app-notification + push, instead of the whole audience.
export function readNotifiedTypes(row) {
  if (!row) return [];
  const raw = row.notified_types ?? row.notifiedTypes;
  if (Array.isArray(raw)) return normalizeTargetTypes(raw);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return normalizeTargetTypes(JSON.parse(raw));
    } catch {
      // Not JSON; treat as nothing-notified so the post is announced normally.
    }
  }
  return [];
}

// The types in `categories` that have not yet been announced to, given the
// types already announced (`notifiedTypes`). 'all' covers every registered
// beneficiary, so a named registered type is considered covered once 'all' has
// gone out; 'public' has no registered audience and is only covered by itself.
export function newlyTargeted(categories, notifiedTypes) {
  const cats = normalizeTargetTypes(categories);
  const done = normalizeTargetTypes(notifiedTypes);
  return cats.filter(
    (t) => !done.includes(t) && !(done.includes(ALL_TARGET) && t !== PUBLIC_TARGET)
  );
}

// The single value the legacy column holds: the one type when exactly one is
// targeted, and 'all' for anything wider. Deriving it here (rather than letting
// each route decide) is what keeps the old consumers and the new list from
// drifting apart.
export function legacyTargetType(types) {
  return types.length === 1 ? types[0] : ALL_TARGET;
}

// Which concrete types a notification has to match. Empty means "no type
// restriction", i.e. everyone verified -- but only 'all' may mean that.
//
// 'public' never matches a registered beneficiary, so it is excluded here and a
// list that is all 'public' must resolve to matching *nobody*, never to empty
// (which fans out to everybody). The '__none__' marker satisfies that: it is not
// a real beneficiary_type, so the IN clause it feeds selects zero rows.
export function concreteTargets(types) {
  const filtered = types.filter((t) => t !== PUBLIC_TARGET);
  if (filtered.includes(ALL_TARGET)) return [];
  return filtered.length ? filtered : ['__none__'];
}

// Writes the normalised list into the JSON column. `mysql2` binds a JSON column
// as a string, so the array is serialised here rather than handed over as one.
export function toJsonColumn(types) {
  return JSON.stringify(types);
}

// ── Audience filtering for the beneficiary-facing list endpoints ──────────────
// Programs, trainings and advisories are targeted at specific beneficiary types
// via the admin's checkbox. A signed-in beneficiary should only see the posts
// whose audience includes their own type (plus 'all' and 'public', the same rule
// the home feed applies). `alias` is the table alias when the query uses one
// (e.g. 'a' for announcements); pass '' for an unaliased table.
export function audienceMatchSql(alias = '') {
  const p = alias ? `${alias}.` : '';
  return `(
    JSON_CONTAINS(${p}target_beneficiary_types, JSON_QUOTE('all'))
    OR JSON_CONTAINS(${p}target_beneficiary_types, JSON_QUOTE('public'))
    OR JSON_CONTAINS(${p}target_beneficiary_types, JSON_QUOTE(?))
    OR ${p}target_type = 'all'
    OR ${p}target_type = ?
    OR ${p}target_type = 'public'
  )`;
}

// The two bind parameters that go with audienceMatchSql.
export function audienceMatchParams(type) {
  return [type, type];
}

// Public (anonymous) visibility: a post is public when its audience includes the
// general public, i.e. 'public' is among the targets. Programs and trainings
// cache this same rule in their derived `show_on_website` column; announcements
// have no such column, so the anonymous chatbot scope matches through here for
// all three. Named nothing when the selection was empty, so this never widens to
// "everyone" the way an empty IN would.
export function publicMatchSql(alias = '') {
  const p = alias ? `${alias}.` : '';
  return `(
    JSON_CONTAINS(${p}target_beneficiary_types, JSON_QUOTE('public'))
    OR ${p}target_type = 'public'
  )`;
}

// Resolves the beneficiary type of a signed-in user, or null when the user has
// no beneficiary profile (e.g. an admin) — in which case no audience filter is
// applied and the caller sees everything, exactly as before.
export async function beneficiaryTypeForUser(pool, userId) {
  const [rows] = await pool.query(
    'SELECT beneficiary_type, category FROM beneficiaries WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return rows[0]?.beneficiary_type || rows[0]?.category || null;
}

// Human-readable audience for places that print a program or announcement to a
// person -- the chatbot, and any SMS/notification copy. Without this, a widened
// audience would fall through to a `? 'Farmers' : ...` default and be announced
// to farmers only.
const DISPLAY = {
  all: 'All beneficiaries',
  farmer: 'Farmers',
  fisherfolk: 'Fisherfolks',
  livestock_owner: 'Livestock Owners',
  public: 'General public',
};

// Reads whichever representation the caller has: the JSON list, or just the
// legacy column for a query that only selected that. Takes the whole row and
// goes through readTargetTypes rather than accepting a value, because the JSON
// column reaches the driver as an array *or* a JSON string depending on version,
// and normalising a JSON string as if it were a single type yields nothing.
export function targetLabel(row) {
  const list = readTargetTypes(row);
  if (!list.length) return '';
  if (list.includes(ALL_TARGET)) {
    // 'all' names the registered half; the public addition is worth saying too,
    // since it changes who sees the post on the website.
    return list.includes(PUBLIC_TARGET)
      ? `${DISPLAY.all}, ${DISPLAY.public}`
      : DISPLAY.all;
  }
  return list.map((t) => DISPLAY[t] ?? t).join(', ');
}

// Request-body guard used by every create/edit route. A post nobody receives is
// never what the admin meant, so an empty or entirely unrecognised selection is
// rejected outright instead of defaulting to everyone -- defaulting to 'all'
// would turn a typo into a full broadcast.
export function requireTargetTypes(input) {
  const types = normalizeTargetTypes(input);
  if (!types.length) {
    throw new HttpError(400, 'Select at least one target beneficiary type', {
      field: 'target_beneficiary_types',
    });
  }
  return types;
}
