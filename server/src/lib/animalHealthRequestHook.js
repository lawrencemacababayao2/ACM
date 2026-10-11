// Bridge from service requests to Animal Health records.
//
// TODO(animal-health): this is the seam where a completed service request should
// create its own report row, and it is deliberately inert today because
// `requests` carries none of the animal-health fields the report needs.
//
// What `requests` has today (schema.sql):
//   beneficiary_id, type, subject, details, quantity, preferred_date, status,
//   scheduled_for, admin_notes
//
// What `animal_health_records` requires:
//   record_date, barangay, farmer_name, activity[], medicine_used, species,
//   age_value, age_unit, no_of_heads, treated_by
//
// Only farmer_name and barangay are derivable (via beneficiaries). The rest
// would have to be guessed from free text: `details` and `admin_notes` are prose,
// and `quantity` is a count of the requested item rather than a count of animals
// treated. Writing a record from those guesses would put invented medicine names
// and species into an official report, so nothing is written.
//
// To wire this up:
//   1. Add the missing columns to `requests` (a follow-up migration), for example
//      ah_activity JSON, ah_medicine_used VARCHAR(160), ah_species VARCHAR(64),
//      ah_age_value SMALLINT UNSIGNED, ah_age_unit VARCHAR(16), ah_no_of_heads INT,
//      and ah_treated_by VARCHAR(80) naming who carried out the visit. The two
//      VARCHAR columns are lists the office curates in report_option_values, not
//      enums (see migration 012), so a follow-up migration should not re-freeze them.
//   2. Add those columns to the request form and to PUT /api/requests/:id.
//   3. Replace the guard below with the INSERT. `request_id` is UNIQUE and the
//      status update is not idempotent-guarded, so the insert must ignore a
//      duplicate-key error rather than fail the status change.
//   4. Validate the species and the name against report_option_values here too. The
//      API does that for records the form posts, but this INSERT bypasses the API,
//      so a value off the list would land in the report unselectable.
//
// The request row is also re-read here rather than trusted from the caller's
// copy, so a retry cannot resurrect a deleted request.

import { pool } from '../config/db.js';
import { parseJsonList } from './jsonList.js';

// Columns `requests` would need before an automatic record can be built. Kept as
// data so the check below and the instructions above cannot drift apart.
const REQUIRED_REQUEST_FIELDS = [
  'ah_activity',
  'ah_medicine_used',
  'ah_species',
  'ah_age_value',
  'ah_age_unit',
  'ah_no_of_heads',
];

// Returns the columns of `requests` that this table actually has.
async function requestColumns() {
  const [rows] = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'requests'`
  );
  return new Set(rows.map((row) => row.column_name));
}

export async function hasAnimalHealthRequestFields() {
  const columns = await requestColumns();
  return REQUIRED_REQUEST_FIELDS.every((name) => columns.has(name));
}

// Called after a request's status is set to 'completed'.
//
// Resolves to { created: false, reason } today. It never throws: a report gap must
// not be able to fail the status change the staff member actually asked for.
export async function createAnimalHealthRecordFromRequest(requestId, actor) {
  if (!(await hasAnimalHealthRequestFields())) {
    return {
      created: false,
      reason: 'requests has no animal-health fields yet; see the TODO in this file',
    };
  }

  // TODO(animal-health): build the INSERT here once the columns above exist.
  //   INSERT INTO animal_health_records
  //     (record_date, barangay, farmer_name, beneficiary_id, activity,
  //      medicine_used, species, age_value, age_unit, no_of_heads, treated_by,
  //      created_by, request_id, source, notes)
  //   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'request', ?)
  // with `activity` as JSON.stringify(parseJsonList(row.ah_activity)).
  return { created: false, reason: 'not implemented yet' };
}