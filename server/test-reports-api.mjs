// End-to-end checks for the config-driven reports API and its permissions.
// Runs against the live server; creates and removes its own records.
const BASE = process.env.API_BASE || 'http://localhost:3001/api';

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) { passed += 1; return; }
  failures.push(`${name}${detail ? ' :: ' + detail : ''}`);
}

function eq(name, actual, expected) {
  check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// Every request is bounded by a timeout so a hung API fails the run as a clear
// error instead of leaving the command attached to a socket that never answers.
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 15000);

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* csv or plain text */ }
  return { status: res.status, json, text, headers: res.headers };
}

// ---------------- auth ----------------
const login = await call('/auth/login', {
  method: 'POST',
  body: { email: 'admin@mao.gov.ph', password: 'admin123' },
});
eq('admin login', login.status, 200);
const admin = login.json?.token;
check('admin token issued', Boolean(admin));

// An earlier run that crashed mid-way leaves its records behind, which would skew
// every count assertion below. The fixtures are cleared so each run starts from
// the two seeded rows.
const cleanupDb = (await import('mysql2/promise')).default;
const cleanupConn = await cleanupDb.createConnection({
  host: '127.0.0.1', user: 'root', password: '', database: 'acm',
});
await cleanupConn.query(
  "DELETE FROM animal_health_records WHERE farmer_name IN ('X','Test, With Comma','Other Branch Test','Bare Other','Tech Owned','Custom Species Test','Custom Species Too Long','Tech Custom Species','Tech Custom Staff','Tech Recorded Species','Tech Known Species','No Login Vet','Linked Farmer','Varchar Probe')"
);
// Entries this suite added on an earlier, aborted run would make the seeded-list
// assertions above fail before it got as far as adding them itself. Only the two lists
// the suite touches are reset. `x`/`y` prefixes catch the probe entries (over-long and
// reserved-name cases) as well as named ones, because those are generated and so
// cannot be listed literally.
await cleanupConn.query(
  "DELETE FROM report_option_values WHERE (list_name = 'species' AND (value LIKE 'x%' OR value IN ('Muscovy Duck','buffalo','Camel','Other','Other'))) OR (list_name = 'staff' AND (value LIKE 'y%' OR value IN ('Rina the Vet','Made Up Name')))"
);
await cleanupConn.end();

// ---------------- registry ----------------
const typesRes = await call('/reports/types', { token: admin });
eq('GET /reports/types status', typesRes.status, 200);
const types = typesRes.json;
check('registry is an array', Array.isArray(types), JSON.stringify(types).slice(0, 200));
const animalHealth = types.find((t) => t.key === 'animalHealth');
check('animalHealth is registered', Boolean(animalHealth));

// The selector must stay hidden while exactly one type is registered.
eq('only one report type registered', types.length, 1);

eq('column order matches the paper form',
  animalHealth.columns.map((c) => c.key).join(','),
  'record_date,barangay,farmer_name,activity,medicine_used,species,age_display,no_of_heads,treated_by_name');

eq('export columns exclude Actions',
  animalHealth.columns.some((c) => c.key === 'actions'), false);

eq('filter keys', animalHealth.filters.map((f) => f.key).join(','),
  'from,to,barangay,species,activity,treated_by');

eq('barangay options are Medina barangays',
  animalHealth.filters.find((f) => f.key === 'barangay').options.length, 19);
check('barangay options include North Poblacion',
  animalHealth.filters.find((f) => f.key === 'barangay').options.includes('North Poblacion'));

// Species is a maintained list like Treated By: both live in report_option_values
// and are curbed from the report screen. The assertions state the intended contents:
// the schema is VARCHAR and the API validates against the stored list. A species is
// only assertable in full when the stored list matches the config seed, which is why
// the equality checks here stay against CONFIGURED_SPECIES.
const CONFIGURED_SPECIES = 'Dog,Cat,Pig,Cattle,Carabao,Goat,Chicken,Other';
// Treated By is a name, so every payload below sends one. The seeded staff entry is
// the one that has no user of its own, which is why it is a good default: the test does
// not have to depend on a staff account existing.
const STAFF = 'MAO Administrator';
eq('species options', animalHealth.fields.find((f) => f.key === 'species').options.join(','),
  CONFIGURED_SPECIES);
eq('activity options', animalHealth.fields.find((f) => f.key === 'activity').options.join(','),
  'Deworming,Castration,Iron,Vitamins,Antibiotic,Vaccination,Other');
eq('age unit options', animalHealth.fields.find((f) => f.key === 'age_unit').options.join(','),
  'days,weeks,months,years');

// The activity filter must not offer "Other": it is a slot for custom text and is
// never stored verbatim, so filtering by it would always return nothing.
check('activity filter hides the non-stored "Other"',
  !animalHealth.filters.find((f) => f.key === 'activity').options.includes('Other'),
  JSON.stringify(animalHealth.filters.find((f) => f.key === 'activity').options));
check('activity form still offers "Other"',
  animalHealth.fields.find((f) => f.key === 'activity').options.includes('Other'));
check('every filter declares a placeholder',
  animalHealth.filters.filter((f) => f.type !== 'date').every((f) => typeof f.placeholder === 'string' && f.placeholder),
  JSON.stringify(animalHealth.filters.map((f) => `${f.key}:${f.placeholder}`)));
check('fields are grouped into sections',
  animalHealth.fields.every((f) => Boolean(f.section)) && Boolean(animalHealth.sections?.animal),
  JSON.stringify(animalHealth.sections));

// Species is a maintained list, managed exactly like the staff list: an admin can add
// an animal and remove one, and the stored list is what the form and the filter offer.
// "Other" is a real category the office records when the animal is not named; it is
// offered in the form and the filter alike, exactly as any other entry is -- unlike
// Activity, where "Other" is a slot for custom text and is never stored verbatim.
const speciesOptions = animalHealth.fields.find((f) => f.key === 'species').options;
const speciesFilterOptions = animalHealth.filters.find((f) => f.key === 'species').options;
for (const [where, list] of [['form', speciesOptions], ['filter', speciesFilterOptions]]) {
  check(`species ${where} offers "Other"`, list.includes('Other'), JSON.stringify(list));
}
const speciesField = animalHealth.fields.find((f) => f.key === 'species');
check('species is a maintained, extendable list',
  speciesField.allowCustom === true
  && speciesField.managed === true
  && speciesField.maxLength === 64
  && ['admin', 'super_admin'].every((r) => (speciesField.customRoles || []).includes(r)),
  JSON.stringify({ allowCustom: speciesField.allowCustom, managed: speciesField.managed, maxLength: speciesField.maxLength, customRoles: speciesField.customRoles }));
check('the species filter is maintainable',
  animalHealth.filters.find((f) => f.key === 'species').listName === 'species');

// The registry must not leak table names or SQL fragments to the browser.
const serialised = JSON.stringify(types);
check('registry hides table name', !serialised.includes('animal_health_records'), 'table name leaked');
check('registry hides SQL', !serialised.includes('JSON_CONTAINS'), 'SQL leaked');

// ---------------- list ----------------
const list = await call('/reports/animal-health', { token: admin });
eq('list status', list.status, 200);
check('list is paginated', typeof list.json.total === 'number' && typeof list.json.pageCount === 'number');
eq('list row count', list.json.data.length, 2);

// Rows come back newest first, so row 0 is the more recent seeded record.
const row = list.json.data[0];
check('activity comes back as an array', Array.isArray(row.activity), JSON.stringify(row.activity));
// Every row must carry a combined age string, whatever its position in the order.
check('age is pre-joined on every row',
  list.json.data.every((r) => /^\d+ (days|weeks|months|years)$/.test(r.age_display)),
  JSON.stringify(list.json.data.map((r) => r.age_display)));
check('treated_by resolves a name', typeof row.treated_by_name === 'string' && row.treated_by_name.length > 0,
  row.treated_by_name);
check('admin may edit', row.can_edit === true);
check('admin may delete', row.can_delete === true);

// ---------------- filters ----------------
const byBarangay = await call('/reports/animal-health?barangay=South Poblacion', { token: admin });
eq('barangay filter', byBarangay.json.data.length, 1);

// The activity filter must match a member of the JSON array, not the whole value.
const byActivity = await call('/reports/animal-health?activity=Vitamins', { token: admin });
eq('activity filter matches a JSON member', byActivity.json.data.length, 1);
check('activity filter picked the two-activity row',
  byActivity.json.data[0].activity.length === 2
  && !byActivity.json.data[0].activity.includes('Vaccination'),
  JSON.stringify(byActivity.json.data[0].activity));

const byActivitySingle = await call('/reports/animal-health?activity=Deworming', { token: admin });
eq('activity filter matches both rows', byActivitySingle.json.data.length, 2);

const bySpecies = await call('/reports/animal-health?species=Carabao', { token: admin });
eq('species filter', bySpecies.json.data.length, 2);

// A repeated activity param means "any of these", not "exactly this".
const byActivityAny = await call('/reports/animal-health?activity=Deworming&activity=Vitamins', { token: admin });
eq('repeated activity param matches both rows', byActivityAny.json.data.length, 2);
check('repeated activity is OR, not AND',
  byActivityAny.json.data.every((r) => r.activity.includes('Deworming') || r.activity.includes('Vitamins')),
  JSON.stringify(byActivityAny.json.data.map((r) => r.activity)));
const activityImpossible = await call('/reports/animal-health?activity=Castration&activity=Antibiotic', { token: admin });
eq('a pair with no matching row returns nothing', activityImpossible.json.data.length, 0);
const activityJunk = await call('/reports/animal-health?activity=NotARealActivity', { token: admin });
eq('an unknown activity matches nothing rather than everything', activityJunk.json.data.length, 0);
// Repeating a single-value filter must not be able to widen the result set.
const repeatedBarangay = await call('/reports/animal-health?barangay=North%20Poblacion&barangay=South%20Poblacion', { token: admin });
check('a repeated single-value filter cannot widen the set',
  repeatedBarangay.json.data.length <= bySpecies.json.data.length,
  `got ${repeatedBarangay.json.data.length}`);

const noMatch = await call('/reports/animal-health?species=Chicken', { token: admin });
eq('non-matching filter returns nothing', noMatch.json.data.length, 0);

const future = await call(
  '/reports/animal-health?from=2099-01-01&to=2099-12-31', { token: admin });
eq('date range excludes older rows', future.json.data.length, 0);

const today = new Date().toISOString().slice(0, 10);
const onToday = await call(`/reports/animal-health?from=${today}&to=${today}`, { token: admin });
check('date range with today bounds is valid', onToday.status === 200);

const badDate = await call('/reports/animal-health?from=not-a-date', { token: admin });
eq('malformed date is rejected', badDate.status, 400);

// ---------------- pagination ----------------
const p1 = await call('/reports/animal-health?page=1&pageSize=1', { token: admin });
eq('page 1 size', p1.json.data.length, 1);
eq('page count', p1.json.pageCount, 2);
const p2 = await call('/reports/animal-health?page=2&pageSize=1', { token: admin });
eq('page 2 size', p2.json.data.length, 1);
check('pages differ', p1.json.data[0].id !== p2.json.data[0].id);

// ---------------- summary ----------------
const summary = await call('/reports/animal-health/summary', { token: admin });
eq('summary status', summary.status, 200);
const cards = Object.fromEntries(summary.json.map((c) => [c.key, c.value]));
eq('total records card', cards.records, 2);
eq('total heads card', cards.heads, 3);
eq('farmers reached card', cards.farmers, 2);
// Two rows, one of which carries two activities: 1 + 2 = 3 treatments.
eq('treatments card counts activities individually', cards.treatments, 3);

const summaryFiltered = await call('/reports/animal-health/summary?barangay=South Poblacion', { token: admin });
const filteredCards = Object.fromEntries(summaryFiltered.json.map((c) => [c.key, c.value]));
eq('summary respects filters', filteredCards.heads, 2);

// ---------------- search ----------------
// The registry already flagged searchable columns, but no endpoint read the flag, so
// a search term was accepted and silently ignored.
const searchName = await call(`/reports/animal-health?q=${encodeURIComponent('Dela Cruz')}`, { token: admin });
eq('search status', searchName.status, 200);
eq('search by farmer name narrows the list', searchName.json.data.length, 1);
eq('search narrows the count', searchName.json.total, 1);
// Only one seeded row carries "Dela Cruz", so the single hit identifies it.
eq('search returns the matching row', searchName.json.data[0]?.farmer_name, 'Ana S. Dela Cruz');

// Activity is a JSON array, so a term inside one still has to match.
const searchActivity = await call('/reports/animal-health?q=Vitamins', { token: admin });
eq('search matches inside a JSON activity array', searchActivity.json.total, 1);
check('the activity match is the right row',
  searchActivity.json.data[0]?.activity.includes('Vitamins'),
  JSON.stringify(searchActivity.json.data[0]?.activity));

// Case-insensitive, and a fragment rather than only the whole value.
const searchPartial = await call('/reports/animal-health?q=dela', { token: admin });
eq('search is case-insensitive and matches a fragment', searchPartial.json.total, 1);
// Both seeded rows are Carabao, so this term has to match both of them.
const searchSpecies = await call('/reports/animal-health?q=carabao', { token: admin });
eq('search matches species', searchSpecies.json.total, 2);
const searchBrangay = await call(`/reports/animal-health?q=${encodeURIComponent('South Poblacion')}`, { token: admin });
eq('search matches barangay', searchBrangay.json.total, 1);

const searchNone = await call('/reports/animal-health?q=zzzzznomatch', { token: admin });
eq('a term that matches nothing returns no rows', searchNone.json.data.length, 0);
eq('a term that matches nothing reports a zero count', searchNone.json.total, 0);
eq('an empty search is not a filter', (await call('/reports/animal-health?q=', { token: admin })).json.total, 2);
eq('a whitespace-only search is not a filter',
  (await call(`/reports/animal-health?q=${encodeURIComponent('   ')}`, { token: admin })).json.total, 2);

// A term is matched as literal text, so a LIKE wildcard in one cannot widen the
// pattern into a match-anything. "%" is on its own not a useful assertion here: both
// seeded rows really do carry "Ivermectin 3.15%", so two rows is the correct answer.
// A term with no literal "%" anywhere in the data is the one that catches it -- an
// unescaped wildcard would come back with the whole table.
const searchUnderscore = await call('/reports/animal-health?q=_', { token: admin });
eq('a bare underscore matches nothing literal', searchUnderscore.json.total, 0);
const searchWildcardNoHit = await call('/reports/animal-health?q=%25zzznomatch', { token: admin });
eq('an escaped percent sign does not widen the pattern', searchWildcardNoHit.json.total, 0);

// Search and filters compose, and the summary cards and the CSV have to agree with
// the table or the page contradicts itself. "Dela Cruz" is the South Poblacion row, so
// combining it with that barangay narrows to one and with the other to none.
const searchAndFilter = await call('/reports/animal-health?q=dela&barangay=South%20Poblacion', { token: admin });
eq('search combines with a filter', searchAndFilter.json.total, 1);
const searchWrongBarangay = await call('/reports/animal-health?q=dela&barangay=North%20Poblacion', { token: admin });
eq('search plus a contradicting filter returns nothing', searchWrongBarangay.json.total, 0);
const searchSummary = await call('/reports/animal-health/summary?q=dela', { token: admin });
eq('summary follows the search', Object.fromEntries(searchSummary.json.map((c) => [c.key, c.value])).records, 1);
const searchCsv = await call('/reports/animal-health/export.csv?q=dela', { token: admin });
eq('csv follows the search', searchCsv.text.trim().split('\r\n').length - 1, 1);

// ---------------- CSV ----------------
const csv = await call('/reports/animal-health/export.csv', { token: admin });
eq('csv status', csv.status, 200);
check('csv content type', String(csv.headers.get('content-type')).includes('text/csv'),
  csv.headers.get('content-type'));
check('csv filename', String(csv.headers.get('content-disposition')).includes('animal-health-monitoring-report.csv'),
  csv.headers.get('content-disposition'));

const csvText = csv.text.replace(/^\uFEFF/, '');
const csvLines = csvText.trim().split('\r\n');
eq('csv header', csvLines[0],
  'Date,Barangay,Farmer\'s Name,Activity,Medicine Used,Species,Age/Age Group,No. of Heads,Treated By');
eq('csv row count', csvLines.length - 1, 2);
check('csv flattens a multi-activity cell', csvLines.some((l) => l.includes('Deworming, Vitamins')),
  csvLines[2]);
check('csv contains the combined age', csvLines.some((l) => l.includes('24 months')));

const csvFiltered = await call('/reports/animal-health/export.csv?barangay=South Poblacion', { token: admin });
eq('csv respects filters', csvFiltered.text.trim().split('\r\n').length - 1, 1);

// A comma inside a value must be quoted, or the row silently gains a column.
const tricky = await call('/reports/animal-health', {
  method: 'POST', token: admin,
  body: {
    record_date: today, barangay: 'South Poblacion', farmer_name: 'Test, With Comma',
    activity: ['Deworming'], medicine_used: 'Ivermectin, 3.15%', species: 'Goat',
    age_value: 12, age_unit: 'months', no_of_heads: 3, treated_by: STAFF, notes: '',
  },
});
eq('create with commas', tricky.status, 201);
const trickyCsv = await call('/reports/animal-health/export.csv?barangay=South Poblacion', { token: admin });
const trickyLines = trickyCsv.text.replace(/^\uFEFF/, '').trim().split('\r\n');
// Locate the row by its farmer name rather than by position: the CSV is ordered by
// date, and the two South Poblacion rows can come back in either order.
const trickyRow = trickyLines.find((l) => l.includes('Test, With Comma'));
check('csv includes the comma-bearing row', Boolean(trickyRow), trickyLines.join(' | '));
eq('csv still has 9 columns for a comma-bearing row',
  (trickyRow || '').split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).length, 9);
check('csv quotes the comma value', (trickyRow || '').includes('"Test, With Comma"'), trickyRow);

// ---------------- create validation ----------------
const missing = await call('/reports/animal-health', {
  method: 'POST', token: admin, body: { record_date: today },
});
// The error handler merges validation details into the top-level body, so each
// offending field is named alongside the message.
eq('create with missing fields is rejected', missing.status, 400);
check('missing fields are named',
  missing.json?.barangay === 'Barangay is required'
  && missing.json?.farmer_name === "Farmer's Name is required"
  && missing.json?.activity === 'Select at least one activity',
  JSON.stringify(missing.json).slice(0, 300));

const badSpecies = await call('/reports/animal-health', {
  method: 'POST', token: admin,
  body: {
    record_date: today, barangay: 'South Poblacion', farmer_name: 'X',
    activity: ['Deworming'], medicine_used: 'M', species: 'Dragon',
    age_value: 1, age_unit: 'months', no_of_heads: 1, treated_by: STAFF,
  },
});
eq('invalid species is rejected', badSpecies.status, 400);

// The columns are VARCHAR, so this must be enforced by the API rather than by the
// schema. "Sheep" is a real animal the fixed list no longer carries -- the old seeded
// list had it, the municipal list does not -- and no record uses it. It stays rejected:
// the list is fixed, never grown through a value appearing on a record.
const removedSpecies = await call('/reports/animal-health', {
  method: 'POST', token: admin,
  body: {
    record_date: today, barangay: 'South Poblacion', farmer_name: 'X',
    activity: ['Deworming'], medicine_used: 'M', species: 'Sheep',
    age_value: 1, age_unit: 'months', no_of_heads: 1, treated_by: STAFF,
  },
});
eq('a species the fixed list does not carry is rejected', removedSpecies.status, 400);

const badAgeUnit = await call('/reports/animal-health', {
  method: 'POST', token: admin,
  body: {
    record_date: today, barangay: 'South Poblacion', farmer_name: 'X',
    activity: ['Deworming'], medicine_used: 'M', species: 'Goat',
    age_value: 1, age_unit: 'fortnights', no_of_heads: 1, treated_by: STAFF,
  },
});
eq('an age unit outside the config list is rejected', badAgeUnit.status, 400);

// A species on the fixed list must be accepted with no schema change, which is the
// whole point of validating against the configured list rather than an enum column.
const newSpecies = await call('/reports/animal-health', {
  method: 'POST', token: admin,
  body: {
    record_date: today, barangay: 'South Poblacion', farmer_name: 'Varchar Probe',
    activity: ['Deworming'], medicine_used: 'M', species: 'Dog',
    age_value: 1, age_unit: 'months', no_of_heads: 1, treated_by: STAFF,
  },
});
eq('a species on the fixed list is accepted', newSpecies.status, 201);
if (newSpecies.json?.id) {
  const byNewSpecies = await call('/reports/animal-health?species=Dog', { token: admin });
  check('the fixed species is filterable',
    byNewSpecies.json.data.some((r) => r.id === newSpecies.json.id),
    `total=${byNewSpecies.json.data.length}`);
  const del = await call(`/reports/animal-health/${newSpecies.json.id}`, { method: 'DELETE', token: admin });
  eq('probe row cleaned up', del.status, 200);
}

const badBarangay = await call('/reports/animal-health', {
  method: 'POST', token: admin,
  body: {
    record_date: today, barangay: 'Not A Barangay', farmer_name: 'X',
    activity: ['Deworming'], medicine_used: 'M', species: 'Goat',
    age_value: 1, age_unit: 'months', no_of_heads: 1, treated_by: STAFF,
  },
});
eq('barangay outside the Medina list is rejected', badBarangay.status, 400);

const zeroHeads = await call('/reports/animal-health', {
  method: 'POST', token: admin,
  body: {
    record_date: today, barangay: 'South Poblacion', farmer_name: 'X',
    activity: ['Deworming'], medicine_used: 'M', species: 'Goat',
    age_value: 1, age_unit: 'months', no_of_heads: 0, treated_by: STAFF,
  },
});
eq('zero heads is rejected', zeroHeads.status, 400);

// Treated By is a managed list, so an unlisted name is refused exactly as an unlisted
// species is. A blank one is refused for being required.
const badStaffName = await call('/reports/animal-health', {
  method: 'POST', token: admin,
  body: {
    record_date: today, barangay: 'South Poblacion', farmer_name: 'X',
    activity: ['Deworming'], medicine_used: 'M', species: 'Goat',
    age_value: 1, age_unit: 'months', no_of_heads: 1, treated_by: 'Nobody At All',
  },
});
eq('a treating name that is not on the list is rejected', badStaffName.status, 400);
check('the refusal names the field',
  String(badStaffName.json?.treated_by || '').toLowerCase().includes('treated by'),
  JSON.stringify(badStaffName.json?.treated_by));

const missingStaffName = await call('/reports/animal-health', {
  method: 'POST', token: admin,
  body: {
    record_date: today, barangay: 'South Poblacion', farmer_name: 'X',
    activity: ['Deworming'], medicine_used: 'M', species: 'Goat',
    age_value: 1, age_unit: 'months', no_of_heads: 1, treated_by: '',
  },
});
eq('a blank treating name is rejected', missingStaffName.status, 400);

// "Other" carries the typed text instead of the literal word.
// The form sends the tick plus the typed name, so the stored value is the text.
const other = await call('/reports/animal-health', {
  method: 'POST', token: admin,
  body: {
    record_date: today, barangay: 'Duka', farmer_name: 'Other Branch Test',
    activity: ['Other', 'Castration', 'Local herbal mix'], medicine_used: 'Local herbal mix',
    species: 'Pig', age_value: 8, age_unit: 'weeks', no_of_heads: 2, treated_by: STAFF,
  },
});
eq('custom activity text is accepted', other.status, 201);

// ---------------- maintained option lists ----------------
// Treated By and Species are both maintained lists: an entry is on one because an admin
// added it, and it stays on the list whether or not any record still uses it -- the whole
// reason the option table exists. The add endpoint joins the list; the delete trims it.
const addSpecies = await call('/reports/animal-health/options', {
  method: 'POST', token: admin, body: { list: 'species', value: 'Muscovy Duck' },
});
eq('an admin can add a species to the list', addSpecies.status, 201);
const removeSpecies = await call(
  `/reports/animal-health/options?list=species&value=${encodeURIComponent('Muscovy Duck')}`,
  { method: 'DELETE', token: admin }
);
eq('an admin can remove a species from the list', removeSpecies.status, 200);

// And a species the list does not carry is refused on the record itself: an off-list
// value only reaches the report once it has been added through the endpoint above.
const customSpecies = await call('/reports/animal-health', {
  method: 'POST', token: admin,
  body: {
    record_date: today, barangay: 'Duka', farmer_name: 'Custom Species Test',
    activity: ['Deworming'], medicine_used: 'M',
    species: 'Muscovy Duck', age_value: 5, age_unit: 'months', no_of_heads: 3, treated_by: STAFF,
  },
});
eq('a species outside the maintained list is refused', customSpecies.status, 400);

// The shape rules for maintained entries still apply to the staff list, which is the
// one that stays maintainable.
const addEmpty = await call('/reports/animal-health/options', {
  method: 'POST', token: admin, body: { list: 'staff', value: '   ' },
});
eq('a blank entry is refused', addEmpty.status, 400);
const addTooLong = await call('/reports/animal-health/options', {
  method: 'POST', token: admin, body: { list: 'staff', value: 'y'.repeat(81) },
});
eq('an over-long entry is refused', addTooLong.status, 400);
// The staff list feeds an 80-character column, so the wider name is legitimate there.
const addLongStaff = await call('/reports/animal-health/options', {
  method: 'POST', token: admin, body: { list: 'staff', value: 'y'.repeat(80) },
});
eq('a name within the staff column width is accepted', addLongStaff.status, 201);
// A list the type does not maintain is not reachable through this endpoint, whether
// it is a configured-only list or a name nothing maintains.
const addUnmanaged = await call('/reports/animal-health/options', {
  method: 'POST', token: admin, body: { list: 'barangays', value: 'Nowhere' },
});
eq('a list the type does not maintain is refused', addUnmanaged.status, 400);
const addUnknownList = await call('/reports/animal-health/options', {
  method: 'POST', token: admin, body: { list: 'nonsense', value: 'Whatever' },
});
eq('an unknown list is refused', addUnknownList.status, 400);

// The add-then-remove round trip cancelled itself out: the throwaway species is gone
// from the registry, on the form and in the filter alike.
const grownTypes = (await call('/reports/types', { token: admin })).json;
const grownType = grownTypes.find((t) => t.key === 'animalHealth');
const grownFieldOptions = grownType.fields.find((f) => f.key === 'species').options;
const grownFilterOptions = grownType.filters.find((f) => f.key === 'species').options;
for (const [where, list] of [['form', grownFieldOptions], ['filter', grownFilterOptions]]) {
  check(`the removed species leaves the ${where} list`, !list.includes('Muscovy Duck'),
    JSON.stringify(list));
}

// Treated By is a maintained list too, and it is a name rather than a login.
const addStaff = await call('/reports/animal-health/options', {
  method: 'POST', token: admin, body: { list: 'staff', value: 'Rina the Vet' },
});
eq('an admin can add a name to the staff list', addStaff.status, 201);
const staffListAfterAdd = (await call('/reports/types', { token: admin })).json
  .find((t) => t.key === 'animalHealth').fields.find((f) => f.key === 'treated_by').options;
check('the added name is offered', staffListAfterAdd.includes('Rina the Vet'),
  JSON.stringify(staffListAfterAdd));

// Somebody who carried out the work need not have an account, which was the whole
// reason the column stopped being a user id.
const noLoginRecord = await call('/reports/animal-health', {
  method: 'POST', token: admin,
  body: {
    record_date: today, barangay: 'Duka', farmer_name: 'No Login Vet',
    activity: ['Vaccination'], medicine_used: 'Rabo Vaccine',
    species: 'Chicken', age_value: 2, age_unit: 'months', no_of_heads: 4,
    treated_by: 'Rina the Vet',
  },
});
eq('a name with no login can be recorded as treating staff', noLoginRecord.status, 201);
const noLoginRow = (await call('/reports/animal-health?pageSize=100', { token: admin }))
  .json.data.find((r) => r.id === noLoginRecord.json.id);
eq('the name round-trips unchanged', noLoginRow?.treated_by, 'Rina the Vet');
eq('the display column shows the name', noLoginRow?.treated_by_name, 'Rina the Vet');

// The usage count is what the removal warning is built from, so it has to count the
// records rather than assume there are none.
const usageNamed = await call(
  `/reports/animal-health/options/usage?list=staff&value=${encodeURIComponent('Rina the Vet')}`,
  { token: admin }
);
eq('usage counts the records crediting a name', usageNamed.json?.inUse, 1);

// Removing a name that a record credits is allowed, and the record is left alone.
const removeStaff = await call(
  `/reports/animal-health/options?list=staff&value=${encodeURIComponent('Rina the Vet')}`,
  { method: 'DELETE', token: admin }
);
eq('a name in use can be removed', removeStaff.status, 200);
const afterStaffRemove = (await call('/reports/animal-health?pageSize=100', { token: admin }))
  .json.data.find((r) => r.id === noLoginRecord.json.id);
eq('removing the entry does not rewrite the record that used it',
  afterStaffRemove?.treated_by_name, 'Rina the Vet');
const staffListAfterRemove = (await call('/reports/types', { token: admin })).json
  .find((t) => t.key === 'animalHealth').fields.find((f) => f.key === 'treated_by').options;
check('the removed name is no longer offered', !staffListAfterRemove.includes('Rina the Vet'),
  JSON.stringify(staffListAfterRemove));
await call(`/reports/animal-health/${noLoginRecord.json.id}`, { method: 'DELETE', token: admin });

// A bare "Other" carries no information, so it must be rejected.
const bareOther = await call('/reports/animal-health', {
  method: 'POST', token: admin,
  body: {
    record_date: today, barangay: 'Duka', farmer_name: 'Bare Other',
    activity: ['Other'], medicine_used: 'M', species: 'Pig',
    age_value: 8, age_unit: 'weeks', no_of_heads: 2, treated_by: STAFF,
  },
});
eq('a bare "Other" is rejected', bareOther.status, 400);
check('bare "Other" asks for the name',
  String(bareOther.json?.activity || '').toLowerCase().includes('activity name'),
  String(bareOther.json?.activity));
const otherFetch = await call(`/reports/animal-health?q=`, { token: admin });
const otherRow = otherFetch.json.data.find((r) => r.id === other.json.id);
check('custom text replaced the literal Other',
  otherRow && !otherRow.activity.includes('Other') && otherRow.activity.includes('Castration'),
  JSON.stringify(otherRow?.activity));

// ---------------- update ----------------
const update = await call(`/reports/animal-health/${other.json.id}`, {
  method: 'PUT', token: admin, body: { no_of_heads: 5, notes: 'Corrected count' },
});
eq('partial update status', update.status, 200);
const afterUpdate = await call('/reports/animal-health', { token: admin });
const updatedRow = afterUpdate.json.data.find((r) => r.id === other.json.id);
eq('update changed the value', updatedRow.no_of_heads, 5);
eq('update left other fields alone', updatedRow.farmer_name, 'Other Branch Test');

const updateMissing = await call('/reports/animal-health/999999', {
  method: 'PUT', token: admin, body: { no_of_heads: 2 },
});
eq('update on a missing record is 404', updateMissing.status, 404);

// ---------------- delete ----------------
const del = await call(`/reports/animal-health/${other.json.id}`, { method: 'DELETE', token: admin });
eq('delete status', del.status, 200);
const delAgain = await call(`/reports/animal-health/${other.json.id}`, { method: 'DELETE', token: admin });
eq('second delete is 404', delAgain.status, 404);

const cleanup = await call(`/reports/animal-health/${tricky.json.id}`, { method: 'DELETE', token: admin });
eq('cleanup delete', cleanup.status, 200);

// ---------------- technician permissions ----------------
const bcrypt = (await import('bcryptjs')).default;
const hash = bcrypt.hashSync('tech123', 10);
const db = (await import('mysql2/promise')).default;
const conn = await db.createConnection({ host: '127.0.0.1', user: 'root', password: '', database: 'acm' });

// An aborted earlier run would otherwise leave these behind and trip the UNIQUE
// email constraint, so the fixtures are cleared first.
await conn.query("DELETE FROM users WHERE email IN ('tech@mao.gov.ph','tech2@mao.gov.ph')");
await conn.query(
  "INSERT INTO users (email, first_name, last_name, password_hash, role) VALUES ('tech@mao.gov.ph', 'Field', 'Technician', ?, 'technician')",
  [hash]
);
const [techRow] = await conn.query("SELECT id FROM users WHERE email = 'tech@mao.gov.ph'");
const techId = techRow[0].id;

const secondHash = bcrypt.hashSync('tech123', 10);
await conn.query(
  "INSERT INTO users (email, first_name, last_name, password_hash, role) VALUES ('tech2@mao.gov.ph', 'Other', 'Technician', ?, 'technician')",
  [secondHash]
);
const [tech2Row] = await conn.query("SELECT id FROM users WHERE email = 'tech2@mao.gov.ph'");
const tech2Id = tech2Row[0].id;

const techLogin = await call('/auth/login', {
  method: 'POST', body: { email: 'tech@mao.gov.ph', password: 'tech123' },
});
eq('technician login', techLogin.status, 200);
if (techLogin.status !== 200) {
  console.error('technician login failed:', techLogin.text.slice(0, 300));
}
const tech = techLogin.json?.token;

const techList = await call('/reports/animal-health', { token: tech });
eq('technician can read the list', techList.status, 200);
if (techList.status !== 200) {
  console.error('technician list failed:', techList.text.slice(0, 300));
}
const seededRow = techList.json?.data?.find((r) => r.id !== other.json.id);
if (!seededRow) {
  console.error('no seeded row visible to technician; saw:',
    JSON.stringify(techList.json?.data?.map((r) => r.id)));
}
check('technician cannot edit a record they did not create',
  seededRow && seededRow.can_edit === false, JSON.stringify(seededRow?.can_edit));
check('technician cannot delete anything',
  techList.json.data.every((r) => r.can_delete === false));

const techForeignEdit = await call(`/reports/animal-health/${seededRow.id}`, {
  method: 'PUT', token: tech, body: { no_of_heads: 99 },
});
eq("technician editing someone else's record is refused", techForeignEdit.status, 403);

const techDelete = await call(`/reports/animal-health/${seededRow.id}`, { method: 'DELETE', token: tech });
eq('technician delete is refused', techDelete.status, 403);

// A technician's own record. The species and the treating name both come off the
// managed lists rather than off the technician's own account.
const techCreate = await call('/reports/animal-health', {
  method: 'POST', token: tech,
  body: {
    record_date: today, barangay: 'Gasa', farmer_name: 'Tech Owned',
    activity: ['Vaccination'], medicine_used: 'Rabo Vaccine', species: 'Chicken',
    age_value: 3, age_unit: 'months', no_of_heads: 20, treated_by: STAFF,
  },
});
eq('technician can create', techCreate.status, 201);

// The species list is the fixed vocabulary a technician works within. A value the
// list does not carry is refused regardless of who sends it.
const techCustomSpecies = await call('/reports/animal-health', {
  method: 'POST', token: tech,
  body: {
    record_date: today, barangay: 'Gasa', farmer_name: 'Tech Custom Species',
    activity: ['Vaccination'], medicine_used: 'Rabo Vaccine', species: 'Camel',
    age_value: 3, age_unit: 'months', no_of_heads: 2, treated_by: STAFF,
  },
});
eq('technician may not invent a species', techCustomSpecies.status, 400);
check('the refusal names the field',
  String(techCustomSpecies.json?.species || '').toLowerCase().includes('species'),
  JSON.stringify(techCustomSpecies.json?.species));

// Nor may they invent a name to credit the work to.
const techCustomStaff = await call('/reports/animal-health', {
  method: 'POST', token: tech,
  body: {
    record_date: today, barangay: 'Gasa', farmer_name: 'Tech Custom Staff',
    activity: ['Vaccination'], medicine_used: 'Rabo Vaccine', species: 'Goat',
    age_value: 3, age_unit: 'months', no_of_heads: 2, treated_by: 'Made Up Name',
  },
});
eq('technician may not invent a treating name', techCustomStaff.status, 400);

// The species list is fixed, so every entry on it is openly available to the
// technician treating the next animal: no admin has to add anything first, and "Dog"
// is on the list even though no earlier fixture has used it.
const techRecordedSpecies = await call('/reports/animal-health', {
  method: 'POST', token: tech,
  body: {
    record_date: today, barangay: 'Gasa', farmer_name: 'Tech Recorded Species',
    activity: ['Vaccination'], medicine_used: 'Rabo Vaccine', species: 'Dog',
    age_value: 3, age_unit: 'months', no_of_heads: 2, treated_by: STAFF,
  },
});
eq('a technician may use any listed species', techRecordedSpecies.status, 201);
const techKnownSpecies = await call('/reports/animal-health', {
  method: 'POST', token: tech,
  body: {
    record_date: today, barangay: 'Gasa', farmer_name: 'Tech Known Species',
    activity: ['Vaccination'], medicine_used: 'Rabo Vaccine', species: 'Goat',
    age_value: 3, age_unit: 'months', no_of_heads: 2, treated_by: STAFF,
  },
});
eq('technician may still pick from the list', techKnownSpecies.status, 201);

// The lists themselves, on either list. Species is not maintainable at all, so the
// add and remove endpoints refuse it before any role is read -- but those endpoints
// are admin-only to begin with, so a technician is turned away by the gate first.
const techAddsSpecies = await call('/reports/animal-health/options', {
  method: 'POST', token: tech, body: { list: 'species', value: 'Camel' },
});
eq('a technician cannot reach the option endpoints', techAddsSpecies.status, 403);
const techRemovesSpecies = await call(
  `/reports/animal-health/options?list=species&value=${encodeURIComponent('Carabao')}`,
  { method: 'DELETE', token: tech }
);
eq('a technician cannot trim a list', techRemovesSpecies.status, 403);
const techAddsStaff = await call('/reports/animal-health/options', {
  method: 'POST', token: tech, body: { list: 'staff', value: 'Made Up Name' },
});
eq('a technician cannot add to the staff list', techAddsStaff.status, 403);
// The refused adds left nothing behind.
check('a refused add does not reach the list',
  !(await call('/reports/types', { token: admin })).json
    .find((t) => t.key === 'animalHealth').fields.find((f) => f.key === 'species').options.includes('Camel'));

// Reading the usage count is not editing, so it is open to whoever may write records.
const techUsage = await call(
  '/reports/animal-health/options/usage?list=species&value=Muscovy%20Duck', { token: tech }
);
eq('a technician can read the usage count', techUsage.status, 200);

// The treating name is stored as given. A technician records who they are, but since the
// column is a name rather than a login there is nothing for the server to force it to,
// and the value round-trips as typed.
const techRowFetched = await call('/reports/animal-health', { token: admin });
const techOwnRow = techRowFetched.json.data.find((r) => r.id === techCreate.json.id);
eq('the chosen treating name is stored as given', techOwnRow.treated_by_name, STAFF);

const techOwnEdit = await call(`/reports/animal-health/${techCreate.json.id}`, {
  method: 'PUT', token: tech, body: { no_of_heads: 21 },
});
eq('technician can edit their own record', techOwnEdit.status, 200);

// A technician listing their own record must be told they may edit it.
const techSeesOwn = await call('/reports/animal-health', { token: tech });
const own = techSeesOwn.json.data.find((r) => r.id === techCreate.json.id);
check('technician may edit their own record in the UI', own?.can_edit === true, String(own?.can_edit));

// A partial update of the attribution is accepted like any other field, and the value is
// validated against the managed list rather than against a user table.
const techTryStaffUpdate = await call(`/reports/animal-health/${techCreate.json.id}`, {
  method: 'PUT', token: tech, body: { treated_by: 'Made Up Name' },
});
eq('a technician cannot set a treating name that is not on the list',
  techTryStaffUpdate.status, 400);
const techAfterSpoof = await call('/reports/animal-health', { token: admin });
const stillTech = techAfterSpoof.json.data.find((r) => r.id === techCreate.json.id);
eq('the refused update left the attribution alone', stillTech.treated_by_name, STAFF);

// Ownership is still what gates an edit: the attribution is no longer the technician's
// own name, so it cannot stand in for that check.
const techEditsSeed = await call(`/reports/animal-health/${seededRow.id}`, {
  method: 'PUT', token: tech, body: { treated_by: STAFF },
});
eq("a technician still cannot edit somebody else's record to claim it",
  techEditsSeed.status, 403);

await call(`/reports/animal-health/${techCreate.json.id}`, { method: 'DELETE', token: admin });

// ---------------- option endpoints ----------------
// The registry is what the dropdowns draw on, and it must be reachable by a technician:
// they pick from the fixed species list and the maintained staff list on every record
// they file.
const techRegistry = await call('/reports/types', { token: tech });
eq('a technician can load the registry', techRegistry.status, 200);
const techRegistryFields = techRegistry.json.find((t) => t.key === 'animalHealth').fields;
const techSpeciesField = techRegistryFields.find((f) => f.key === 'species');
const techStaffField = techRegistryFields.find((f) => f.key === 'treated_by');
check('the registry tells the form which lists it may edit',
  techSpeciesField.managed === false
  && techStaffField.managed === true
  && !(techStaffField.customRoles || []).includes('technician'),
  JSON.stringify({ species: techSpeciesField.managed, treated_by: techStaffField.managed, customRoles: techStaffField.customRoles }));

// The form has to address the add and remove endpoints by list *name*. `options` on a
// managed field is already resolved into the values themselves, so without a separate
// `listName` the browser posts that array where a name is expected and the add is
// refused as "that list is not maintained here". Pinned here because the failure is
// only visible by clicking through the form.
const listFields = types.find((t) => t.key === 'animalHealth').fields;
const speciesListField = listFields.find((f) => f.key === 'species');
const staffListField = listFields.find((f) => f.key === 'treated_by');
check('a fixed field carries no list name',
  speciesListField?.listName === null,
  JSON.stringify({ species: speciesListField?.listName }));
check('a managed field carries the name of the list it draws on',
  staffListField?.listName === 'staff',
  JSON.stringify({ treated_by: staffListField?.listName }));
check('a field that maintains nothing carries no list name',
  listFields.filter((f) => !f.managed).every((f) => !f.listName),
  JSON.stringify(listFields.filter((f) => !f.managed).map((f) => ({ key: f.key, listName: f.listName }))));
// The name has to be one the endpoints know, which is the name a maintained field
// declares rather than a label or a column.
const listNameIsAddable = await call('/reports/animal-health/options', {
  method: 'POST', token: admin, body: { list: staffListField?.listName, value: 'Rina the Vet' },
});
eq('the list name a maintained field publishes is one the add endpoint accepts', listNameIsAddable.status, 201);

// The old id-based staff endpoint is gone: attribution is a name, so there is no user
// list for the report to read.
const oldStaffEndpoint = await call('/reports/animal-health/options/users', { token: admin });
eq('the id-based staff options endpoint is gone', oldStaffEndpoint.status, 404);

const anonUsage = await call('/reports/animal-health/options/usage?list=species&value=Goat');
eq('usage without a token is 401', anonUsage.status, 401);
const anonTypes = await call('/reports/animal-health/options', { method: 'POST', body: { list: 'species', value: 'X' } });
eq('adding without a token is 401', anonTypes.status, 401);
const anonRemove = await call('/reports/animal-health/options?list=species&value=Goat', { method: 'DELETE' });
eq('removing without a token is 401', anonRemove.status, 401);
const unknownTypeOptions = await call('/reports/not-a-type/options', {
  method: 'POST', token: admin, body: { list: 'species', value: 'X' },
});
eq('adding to an unknown type is 404', unknownTypeOptions.status, 404);

const [benRows] = await conn.query(
  "SELECT id, first_name FROM beneficiaries WHERE first_name LIKE '%a%' ORDER BY id LIMIT 1"
);
const benId = benRows[0]?.id;
const benName = benRows[0]?.first_name || 'x';

const benSearch = await call(`/reports/animal-health/options/beneficiaries?q=${benName}`, { token: tech });
eq('beneficiary search is served to a technician', benSearch.status, 200);
check('beneficiary search finds the seeded farmer',
  (benSearch.json || []).some((o) => Number(o.value) === benId),
  JSON.stringify(benSearch.json));
check('beneficiary search returns id/label pairs',
  (benSearch.json || []).every((o) => o.value !== undefined && typeof o.label === 'string'));

const benTooShort = await call('/reports/animal-health/options/beneficiaries?q=a', { token: admin });
eq('a one-character beneficiary query returns nothing', (benTooShort.json || []).length, 0);

// ---------------- edit round-trip ----------------
// The values the edit form needs but the table never shows. If any of these is
// missing from a row, opening the record and saving it would silently clear the
// link, the attribution or the notes.

const linked = await call('/reports/animal-health', {
  method: 'POST', token: admin,
  body: {
    record_date: today, barangay: 'Gasa', farmer_name: 'Linked Farmer',
    beneficiary_id: benId,
    activity: ['Deworming'], medicine_used: 'Ivermectin', species: 'Carabao',
    age_value: 12, age_unit: 'months', no_of_heads: 2, treated_by: STAFF,
    notes: 'Original note',
  },
});
eq('create with a linked beneficiary', linked.status, 201);

const linkedRows = await call('/reports/animal-health?pageSize=100', { token: admin });
const linkedRow = linkedRows.json.data.find((r) => r.id === linked.json.id);

// `treated_by` is the edit form's own field key, so it has to come back as well as the
// display column, or saving an edit would submit an empty attribution.
for (const key of ['beneficiary_id', 'treated_by', 'treated_by_name', 'source', 'notes', 'request_id', 'age_value', 'age_unit']) {
  check(`row carries ${key} for the edit form`, key in linkedRow, JSON.stringify(Object.keys(linkedRow)));
}
eq('beneficiary_id survives the create', Number(linkedRow.beneficiary_id), Number(benId));
eq('notes survive the create', linkedRow.notes, 'Original note');
eq('source is reported', linkedRow.source, 'manual');

// A partial update of one field must leave every other field untouched.
const linkUpdate = await call(`/reports/animal-health/${linked.json.id}`, {
  method: 'PUT', token: admin, body: { no_of_heads: 4 },
});
eq('partial update accepted', linkUpdate.status, 200);
const afterLinkUpdate = await call('/reports/animal-health?pageSize=100', { token: admin });
const relinked = afterLinkUpdate.json.data.find((r) => r.id === linked.json.id);
eq('a partial update does not clear the beneficiary link', Number(relinked.beneficiary_id), Number(benId));
eq('a partial update does not clear the notes', relinked.notes, 'Original note');
eq('a partial update applies its own field', relinked.no_of_heads, 4);
eq('a partial update keeps the attribution', relinked.treated_by, STAFF);
eq('a partial update keeps the display column in step', relinked.treated_by_name, STAFF);

// An edit may change the attribution to another name on the list.
const retag = await call(`/reports/animal-health/${linked.json.id}`, {
  method: 'PUT', token: admin, body: { treated_by: 'Unassigned' },
});
eq('the attribution can be changed to another listed name', retag.status, 200);
const retagged = (await call('/reports/animal-health?pageSize=100', { token: admin }))
  .json.data.find((r) => r.id === linked.json.id);
eq('the new attribution is stored', retagged?.treated_by, 'Unassigned');
eq('the display column follows it', retagged?.treated_by_name, 'Unassigned');
await call(`/reports/animal-health/${linked.json.id}`, {
  method: 'PUT', token: admin, body: { treated_by: STAFF },
});

const badBen = await call('/reports/animal-health', {
  method: 'POST', token: admin,
  body: {
    record_date: today, barangay: 'Gasa', farmer_name: 'No Such Farmer',
    beneficiary_id: 999999,
    activity: ['Deworming'], medicine_used: 'Ivermectin', species: 'Carabao',
    age_value: 12, age_unit: 'months', no_of_heads: 2, treated_by: STAFF,
  },
});
eq('a dangling beneficiary link is refused', badBen.status, 400);

await call(`/reports/animal-health/${linked.json.id}`, { method: 'DELETE', token: admin });

// Every fixture that put a species of its own on a record is removed before the
// remaining assertions, which count rows. It also returns the species list to the two
// the seed data carries, so the next run starts from the configured list again.
for (const id of [
  techKnownSpecies.json?.id,
  techRecordedSpecies.json?.id,
  techCustomSpecies.json?.id,
  techCustomStaff.json?.id,
]) {
  if (id) await call(`/reports/animal-health/${id}`, { method: 'DELETE', token: admin });
}

// The lists are back to their seeded contents, so a failed run leaves no residue that
// would make the counts above fail next time.
const finalSpecies = (await call('/reports/types', { token: admin })).json
  .find((t) => t.key === 'animalHealth').fields.find((f) => f.key === 'species').options;
eq('the run leaves the species list as it found it', finalSpecies.join(','), CONFIGURED_SPECIES);

// The support values are for the form, never for the table or an export.
check('support values stay out of the client column list',
  !animalHealth.columns.some((c) => ['beneficiary_id', 'treated_by', 'source', 'notes', 'request_id', 'age_value', 'age_unit'].includes(c.key)),
  JSON.stringify(animalHealth.columns.map((c) => c.key)));
// The display column keeps its old key so the table, the CSV and the PDF read the same
// as they did when the name came from a join.
eq('the attribution column keeps its key',
  animalHealth.columns.map((c) => c.key).join(','),
  'record_date,barangay,farmer_name,activity,medicine_used,species,age_display,no_of_heads,treated_by_name');

const csvHasSupport = csv.text.replace(/^\uFEFF/, '');
check('CSV carries only the visible columns',
  !/\bbeneficiary_id\b|\bnotes\b|\brequest_id\b/.test(csvHasSupport.split('\r\n')[0]),
  csvHasSupport.split('\r\n')[0]);

// Summary cards are consumed by the browser, so a card must not carry the SQL
// fragment it was computed from.
check('summary cards do not leak SQL columns',
  (summary.json || []).every((c) => c.column === undefined),
  JSON.stringify(summary.json));
check('summary cards carry a value',
  (summary.json || []).every((c) => typeof c.value === 'number'));

// ---------------- legacy removal ----------------
const legacyRecords = await call('/reports/records', { token: admin });
eq('legacy /reports/records is gone', legacyRecords.status, 404);
const legacyCsv = await call('/reports/export.csv', { token: admin });
eq('legacy /reports/export.csv is gone', legacyCsv.status, 404);
const legacySummary = await call('/reports/summary', { token: admin });
check('legacy summary is not served at the old shape',
  legacySummary.status === 404 || legacySummary.json?.length !== 1,
  JSON.stringify(legacySummary.json));
const legacyFilter = await call('/reports/animal-health?category=crop', { token: admin });
eq('category filter is ignored, not honoured', legacyFilter.json.data.length, 2);

const unknownType = await call('/reports/not-a-type', { token: admin });
eq('unknown report type is 404', unknownType.status, 404);

// ---------------- auth ----------------
const noToken = await call('/reports/animal-health');
eq('list without a token is 401', noToken.status, 401);
const noTokenTypes = await call('/reports/types');
eq('registry without a token is 401', noTokenTypes.status, 401);

// ---------------- cleanup ----------------
await conn.query("DELETE FROM users WHERE email IN ('tech@mao.gov.ph','tech2@mao.gov.ph')");
await conn.end();

// ---------------- report ----------------
console.log(`\npassed: ${passed}`);
if (failures.length) {
  console.log(`FAILED: ${failures.length}`);
  for (const f of failures) console.log('  - ' + f);
  process.exitCode = 1;
} else {
  console.log('all reports API checks passed');
}
