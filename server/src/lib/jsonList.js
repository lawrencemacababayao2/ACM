// MariaDB stores a JSON column as LONGTEXT, so the same column can arrive as a
// JSON string on one query path and as an already-parsed array on another. Reading
// through this helper keeps the two spellings from leaking into CSV, PDF and
// validation output.
//
// It lives in lib/ rather than in a route because the request-completion hook
// needs it too, and importing it from routes/reports.js would make that route and
// routes/requests.js depend on each other.

const KNOWN_ACTIVITIES = ['Deworming', 'Castration', 'Vitamins', 'Antibiotic', 'Vaccination', 'Iron', 'Other'];

function splitDelimiterlessActivities(text) {
  const matches = [];
  let remaining = text;
  // Sort by length descending to match longest first
  const sortedActivities = [...KNOWN_ACTIVITIES].sort((a, b) => b.length - a.length);
  for (const activity of sortedActivities) {
    const regex = new RegExp(activity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    if (regex.test(remaining)) {
      matches.push(activity);
      remaining = remaining.replace(regex, '');
    }
  }
  // If we found matches and nothing remains (or only whitespace), return matches
  if (matches.length > 0 && remaining.trim() === '') {
    return matches;
  }
  // If we couldn't fully parse, return null to fall back to other parsing
  return null;
}

export function parseJsonList(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [String(parsed)];
    } catch {
      // Tolerate a legacy comma-separated value rather than dropping the record.
      const commaParts = value.split(',').map((part) => part.trim()).filter(Boolean);
      if (commaParts.length > 1) return commaParts;
      // Try to split delimiter-less text on known activity names
      const split = splitDelimiterlessActivities(value);
      if (split) return split;
      // Fall back to single value
      return [value.trim()];
    }
  }
  return [String(value)];
}