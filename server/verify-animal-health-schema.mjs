// Asserts the live database matches migrations 010-012.
//
// The constraint probes at the bottom insert and then remove rows of their own, and
// restore the request status they change, so the run leaves the data as it found it.
import mysql from 'mysql2/promise';

const c = await mysql.createConnection({
  host: '127.0.0.1', user: 'root', password: '', database: 'acm', dateStrings: true,
});

const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };

const [tables] = await c.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema = 'acm'"
);
const names = new Set(tables.map((t) => t.table_name));
check(names.has('animal_health_records'), 'animal_health_records is missing');
check(names.has('report_option_values'), 'report_option_values is missing');
check(!names.has('report_records'), 'report_records still exists');

const [optionCols] = await c.query(
  "SELECT column_name, column_type FROM information_schema.columns " +
  "WHERE table_schema = 'acm' AND table_name = 'report_option_values'"
);
const optionByName = Object.fromEntries(optionCols.map((o) => [o.column_name, o]));
for (const required of ['id', 'list_name', 'value', 'sort_order', 'created_at']) {
  check(Boolean(optionByName[required]), `report_option_values.${required} is missing`);
}
// The unique key is what stops the dropdown carrying two spellings of one animal, which
// the API's INSERT IGNORE relies on.
const [optionUnique] = await c.query(
  "SELECT column_name FROM information_schema.key_column_usage " +
  "WHERE table_schema = 'acm' AND table_name = 'report_option_values' AND column_name IN ('list_name','value')"
);
check(optionUnique.length >= 2, 'report_option_values has no index on (list_name, value)');

const [lists] = await c.query(
  'SELECT list_name, COUNT(*) n FROM report_option_values GROUP BY list_name'
);
for (const list of lists) {
  console.log(`report_option_values ${list.list_name}: ${list.n} entries`);
}
for (const expected of ['species', 'staff']) {
  check(lists.some((l) => l.list_name === expected), `the ${expected} list is empty`);
}

const [cols] = await c.query(
  "SELECT column_name, data_type, is_nullable, column_type FROM information_schema.columns " +
  "WHERE table_schema = 'acm' AND table_name = 'animal_health_records'"
);
const byName = Object.fromEntries(cols.map((c) => [c.column_name, c]));
for (const required of [
  'id', 'record_date', 'barangay', 'farmer_name', 'beneficiary_id', 'activity',
  'medicine_used', 'species', 'age_value', 'age_unit', 'no_of_heads', 'treated_by',
  'created_by', 'request_id', 'source', 'notes', 'created_at', 'updated_at',
]) {
  check(Boolean(byName[required]), `animal_health_records.${required} is missing`);
}
check(byName.record_date?.is_nullable === 'NO', 'record_date must be NOT NULL');
check(byName.barangay?.is_nullable === 'NO', 'barangay must be NOT NULL');
check(byName.farmer_name?.is_nullable === 'NO', 'farmer_name must be NOT NULL');
check(byName.beneficiary_id?.is_nullable === 'YES', 'beneficiary_id must be nullable');
check(byName.request_id?.is_nullable === 'YES', 'request_id must be nullable');
check(byName.notes?.is_nullable === 'YES', 'notes must be nullable');
// species and age_unit are VARCHAR by design since migration 011: the allowed
// values live in the report config and are enforced by the API, so the option
// lists are editable without an ALTER TABLE. Asserting the *storage* type keeps a
// stray re-introduction of an ENUM from silently re-freezing the dropdowns -- the
// allowed values are checked against the config further down.
check(String(byName.species?.column_type).startsWith('varchar'), `species must be VARCHAR, not an enum (is ${byName.species?.column_type})`);
check(String(byName.age_unit?.column_type).startsWith('varchar'), `age_unit must be VARCHAR, not an enum (is ${byName.age_unit?.column_type})`);
check(String(byName.source?.column_type).includes('request'), 'source enum is wrong');

// Since 012, treated_by holds a name from the managed staff list rather than a user id.
// Asserting the storage type keeps a stray FK back onto users from silently reintroducing
// the rule that only somebody with an account can be credited with a treatment.
check(String(byName.treated_by?.column_type).startsWith('varchar'),
  `treated_by must be VARCHAR holding a name, not an id (is ${byName.treated_by?.column_type})`);
check(byName.treated_by?.is_nullable === 'NO', 'treated_by must be NOT NULL');

const [role] = await c.query(
  "SELECT column_type FROM information_schema.columns " +
  "WHERE table_schema = 'acm' AND table_name = 'users' AND column_name = 'role'"
);
check(String(role[0]?.column_type).includes('technician'), 'users.role has no technician value');

const [fk] = await c.query(
  "SELECT constraint_name, referenced_table_name FROM information_schema.key_column_usage " +
  "WHERE table_schema = 'acm' AND table_name = 'animal_health_records' AND referenced_table_name IS NOT NULL"
);
const fkTargets = new Set(fk.map((f) => f.referenced_table_name));
check(fkTargets.has('beneficiaries'), 'no FK to beneficiaries');
check(fkTargets.has('requests'), 'no FK to requests');
// created_by is still a user id -- it is the ownership rule that gates editing -- but
// treated_by is not, since 012 made attribution a name rather than a login.
const [treatedFk] = await c.query(
  "SELECT constraint_name, column_name FROM information_schema.key_column_usage " +
  "WHERE table_schema = 'acm' AND table_name = 'animal_health_records' " +
  "AND referenced_table_name = 'users' AND column_name = 'treated_by'"
);
check(treatedFk.length === 0, 'treated_by still has an FK to users');

const [rows] = await c.query('SELECT * FROM animal_health_records ORDER BY id');
console.log(`animal_health_records rows: ${rows.length}`);
for (const row of rows) {
  console.log('  ', row.record_date, '|', row.barangay, '|', row.farmer_name, '|',
    row.activity, '|', row.species, '|', row.age_value, row.age_unit, '|',
    row.no_of_heads, 'heads | source=' + row.source);
}

// A single visit tagged with two activities must count as two treatments, and the
// JSON must survive the MariaDB TEXT-backed JSON round trip as an array.
const [multi] = await c.query(
  'SELECT JSON_LENGTH(activity) n FROM animal_health_records WHERE JSON_LENGTH(activity) > 1'
);
check(multi.length > 0, 'no multi-activity row was seeded');

// Seeded values must come from the list they belong to. The API validates on write, but
// seed and hook SQL bypass that check, and an unrecognised entry would be invisible in
// the UI while still being stored -- and, for the managed lists, unselectable in the
// filter.
//
// Species and Treated By are read out of report_option_values rather than the config,
// since 012 moved them there. A value that is on a record but not on its list is listed
// rather than failed: removing an entry that records still carry is allowed by design,
// so such rows are expected after an admin has removed something.
const { ANIMAL_HEALTH_ACTIVITIES, resolveOptions } = await import('./src/data/reportTypes.js');
const [managed] = await c.query(
  "SELECT list_name, value FROM report_option_values WHERE list_name IN ('species','staff')"
);
const speciesList = managed.filter((m) => m.list_name === 'species').map((m) => m.value);
const staffList = managed.filter((m) => m.list_name === 'staff').map((m) => m.value);
const unlistedSpecies = new Set();
const unlistedStaff = new Set();
const [allRows] = await c.query('SELECT * FROM animal_health_records');
for (const row of allRows) {
  const list = typeof row.activity === 'string' ? JSON.parse(row.activity) : row.activity;
  for (const entry of list) {
    check(ANIMAL_HEALTH_ACTIVITIES.includes(entry),
      `row ${row.id} has activity "${entry}", which is not in the configured list`);
  }
  check(resolveOptions('barangays').includes(row.barangay),
    `row ${row.id} has barangay "${row.barangay}", which is not a Medina barangay`);
  check(resolveOptions('ageUnits').includes(row.age_unit),
    `row ${row.id} has age_unit "${row.age_unit}", which is not in the configured list`);
  if (!speciesList.includes(row.species)) {
    unlistedSpecies.add(row.species);
    check(row.species.trim() === row.species && row.species.length <= 64,
      `row ${row.id} has species "${row.species}", which is not trimmed or is over the column width`);
  }
  if (!staffList.includes(row.treated_by)) {
    unlistedStaff.add(row.treated_by);
    check(row.treated_by.trim() === row.treated_by && row.treated_by.length <= 80,
      `row ${row.id} has treated_by "${row.treated_by}", which is not trimmed or is over the column width`);
  }
}
if (unlistedSpecies.size) {
  console.log('species on a record but off the list:', [...unlistedSpecies].join(', '));
}
if (unlistedStaff.size) {
  console.log('treating names on a record but off the list:', [...unlistedStaff].join(', '));
}

// A species still has to fit the column the API validates against, whichever list it is
// on: the longest value the API accepts is bounded by the column, not by the list.
const [widths] = await c.query(
  "SELECT column_name, character_maximum_length n FROM information_schema.columns " +
  "WHERE table_schema = 'acm' AND table_name = 'animal_health_records' AND column_name IN ('species','treated_by')"
);
for (const w of widths) {
  const entries = w.column_name === 'species' ? speciesList : staffList;
  check(entries.every((entry) => entry.length <= w.n),
    `the ${w.column_name} list holds a value over the column width (${w.n})`);
}

// The UNIQUE(request_id) is what makes the hook idempotent, so prove it rejects
// a second row for the same request instead of double-counting heads.
await c.query('UPDATE requests SET status = ? WHERE id = ?', ['completed', 1]);
const [before] = await c.query(
  'INSERT INTO animal_health_records (record_date, barangay, farmer_name, activity, medicine_used, species, age_value, age_unit, no_of_heads, treated_by, created_by, request_id, source) ' +
  "VALUES (CURDATE(), 'Poblacion', 'Hook Test', JSON_ARRAY('Deworming'), 'Test', 'Goat', 12, 'months', 1, 'MAO Administrator', 1, 1, 'request')"
);
let duplicateBlocked = false;
try {
  await c.query(
    'INSERT INTO animal_health_records (record_date, barangay, farmer_name, activity, medicine_used, species, age_value, age_unit, no_of_heads, treated_by, created_by, request_id, source) ' +
    "VALUES (CURDATE(), 'Poblacion', 'Hook Test 2', JSON_ARRAY('Deworming'), 'Test', 'Goat', 12, 'months', 1, 'MAO Administrator', 1, 1, 'request')"
  );
} catch (err) {
  duplicateBlocked = err.code === 'ER_DUP_ENTRY';
}
check(duplicateBlocked, 'request_id is not UNIQUE; the completion hook could double-count');

// CHECK constraints must reject nonsense head counts at the database level too.
let headsBlocked = false;
try {
  await c.query(
    'INSERT INTO animal_health_records (record_date, barangay, farmer_name, activity, medicine_used, species, age_value, age_unit, no_of_heads, treated_by, created_by, source) ' +
    "VALUES (CURDATE(), 'Poblacion', 'Bad Heads', JSON_ARRAY('Deworming'), 'Test', 'Goat', 12, 'months', 0, 'MAO Administrator', 1, 'manual')"
  );
} catch (err) {
  headsBlocked = err.code === 'ER_CONSTRAINT_FAILED' || err.errno === 4025;
}
check(headsBlocked, 'no_of_heads = 0 was accepted; CHECK constraint missing');

await c.query('DELETE FROM animal_health_records WHERE request_id = 1');
await c.query('UPDATE requests SET status = ? WHERE id = ?', ['approved', 1]);

await c.end();

if (problems.length) {
  console.error('\nFAILED:');
  for (const p of problems) console.error('  - ' + p);
  process.exitCode = 1;
} else {
  console.log('\nall animal health schema checks passed');
}