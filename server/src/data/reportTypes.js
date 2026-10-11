// Single source of truth for the report types offered under /reports.
//
// Everything the Reports screen renders comes from here: the table it reads,
// the filter controls, the columns, the CSV and PDF exports, the summary cards
// and the validation applied on save. Adding a report type is therefore a config
// entry plus its table -- the page shell and the API router are both generic and
// need no edits.
//
// The definitions are plain data so the whole registry can be served to the
// browser by GET /api/reports/types. React renderers live in
// web/src/reportTypes.js and are keyed by each entry's `kind`, so the client
// holds presentation choices while the server holds meaning.

import { MEDINA_BARANGAYS } from './locations.js';

// Activity options, in the order the paper form lists them. "Other" is the
// custom-text branch: picking it stores the typed text in its place so a
// finished report never reads just "Other".
export const ANIMAL_HEALTH_ACTIVITIES = [
  'Deworming',
  'Castration',
  'Iron',
  'Vitamins',
  'Antibiotic',
  'Vaccination',
  'Other',
];

// Names the report records as having treated an animal, and who may be picked as
// "Treated By". A maintained list like species: an admin adds and removes names
// from the report screen.
//
// This is attribution on a treatment sheet, not a login. Somebody who carried out a
// vaccination round has to be recordable even when they have no account, and taking
// somebody off the list must not edit the records that credit them. So the name is
// what is stored, and the list of names is the managed list rather than the set of
// staff accounts.
export const ANIMAL_HEALTH_STAFF = [
  'MAO Administrator',
];

// Species the Municipal Agriculture Office tracks. A maintained list, managed the
// same way the staff list is: an admin can add an animal and remove one, so the
// stock of animals in a barangay grows and shrinks from the report screen instead of
// needing a deploy. The array below is the seed and the fallback for a list with
// nothing stored yet.
//
// "Other" is a real entry here, unlike in Activity -- it is a categorical bucket for
// animals the list does not name, and the value is stored verbatim.
export const ANIMAL_HEALTH_SPECIES = [
  'Dog',
  'Cat',
  'Pig',
  'Cattle',
  'Carabao',
  'Goat',
  'Chicken',
  'Other',
];

export const ANIMAL_HEALTH_AGE_UNITS = ['days', 'weeks', 'months', 'years'];

export const REPORT_TYPES = {
  animalHealth: {
    key: 'animalHealth',
    // Used in the URL. Changing it orphans saved CSV filenames and bookmarks.
    slug: 'animal-health',
    title: 'Animal Health Monitoring Report',
    subtitle: 'Interventions, medicines and treatments carried out by the Municipal Agriculture Office',
    // Headings the Add/Edit form groups its fields under, keyed by the `section`
    // on each field. A flat list of twelve controls read as a generic form; these
    // follow the order and headings of the paper form.
    sections: {
      visit: 'Visit',
      farmer: 'Farmer',
      animal: 'Animal',
      treatment: 'Treatment',
      attribution: 'Attribution',
    },
    // Set when a type needs a bespoke create/update path instead of the generic
    // one; the Animal Health record is created from completed service requests.
    table: 'animal_health_records',
    alias: 'r',
    // Ownership column the technician edit rule keys on. Distinct from
    // `treated_by`, which staff are allowed to correct after the fact.
    ownerColumn: 'created_by',
    dateColumn: 'record_date',
    defaultOrder: 'r.record_date DESC, r.id DESC',
    // Option lists the office maintains from the report screen rather than in this
    // file. Their values live in report_option_values, so an entry survives the record
    // it was added for and leaves the list only when an admin removes it. Read by the
    // API and sent to the browser from there; the array above is the seed and the
    // fallback for a list with nothing stored yet. The staff list and the species
    // list are both maintained the same way.
    managedOptions: ['staff', 'species'],
    noun: { one: 'record', many: 'records' },
    exportFilename: 'animal-health-monitoring-report',
    // Fields named when a row is referred to in a message, e.g. the delete
    // confirmation. Declared here so the page shell never hardcodes a field name.
    recordLabel: ['farmer_name', 'record_date'],

    columns: [
      { key: 'record_date', label: 'Date', kind: 'date', source: 'r.record_date', searchable: true },
      { key: 'barangay', label: 'Barangay', kind: 'text', source: 'r.barangay', searchable: true },
      { key: 'farmer_name', label: "Farmer's Name", kind: 'text', source: 'r.farmer_name', searchable: true },
      // Activity is a JSON array, so it is matched as text rather than by equality.
      { key: 'activity', label: 'Activity', kind: 'multi', source: 'r.activity', searchable: true },
      { key: 'medicine_used', label: 'Medicine Used', kind: 'text', source: 'r.medicine_used', searchable: true },
      { key: 'species', label: 'Species', kind: 'text', source: 'r.species', searchable: true },
      { key: 'age_display', label: 'Age/Age Group', kind: 'text', derived: 'age' },
      // age_display is computed from these two, so they have to be selected even
      // though they never appear on their own. `export: false` keeps them out of
      // the CSV and the PDF, where the combined "24 months" cell is wanted.
      { key: 'age_value', label: 'Age', kind: 'number', source: 'r.age_value', export: false },
      { key: 'age_unit', label: 'Age Unit', kind: 'text', source: 'r.age_unit', export: false },
      { key: 'no_of_heads', label: 'No. of Heads', kind: 'number', source: 'r.no_of_heads', align: 'right' },
      // The name is what is stored, so it is what is shown -- there is no id to
      // resolve. The key keeps the column name the table, the CSV and the PDF have
      // always used.
      { key: 'treated_by_name', label: 'Treated By', kind: 'text', source: 'r.treated_by', nullAs: 'Unassigned' },

      // ---- edit support ----
      // The form's own key for the attribution, so an edit round-trips it. It is the
      // same column as treated_by_name above and reads identically, but the two keys
      // serve different callers: the table and the exports use the _name one they have
      // always used, the form uses the key its field declares.
      { key: 'treated_by', label: 'Treated By', kind: 'text', source: 'r.treated_by', export: false },
      // These never appear in the table, the CSV or the PDF, but the edit form has
      // to round-trip them: without them a save would resubmit an empty value and
      // silently clear the link, the attribution or the notes of the record being
      // edited. They are selected and returned, and `export: false` keeps them off
      // every visible surface.
      { key: 'beneficiary_id', label: 'Linked Beneficiary', kind: 'number', source: 'r.beneficiary_id', export: false },
      { key: 'request_id', label: 'From Request', kind: 'number', source: 'r.request_id', export: false },
      // Drives the "From request" badge, so it has to travel with the row even
      // though it is not a column of its own.
      { key: 'source', label: 'Source', kind: 'text', source: 'r.source', export: false },
      { key: 'notes', label: 'Notes', kind: 'text', source: 'r.notes', export: false },

      // Not part of the export: "Actions" only means something on screen.
      { key: 'actions', label: 'Actions', kind: 'actions', export: false, sortable: false },
    ],

    filters: [
      // `placeholder` is the "nothing chosen" text. It is declared here rather
      // than derived from the label in the page, because deriving it produced
      // awkward English ("All activity", "All treated by").
      { key: 'from', label: 'Date from', type: 'date', apply: 'gte' },
      { key: 'to', label: 'Date to', type: 'date', apply: 'lte' },
      { key: 'barangay', label: 'Barangay', type: 'enum', column: 'r.barangay', options: 'barangays', placeholder: 'All barangays' },
      { key: 'species', label: 'Species', type: 'enum', column: 'r.species', options: 'species', managed: true, placeholder: 'All species' },
      // Matching any of the ticked activities, which is what someone reading
      // "Deworming or Vitamins" actually means. "Other" is hidden from the filter:
      // it is a slot for custom text, never a stored value, so filtering by it
      // would always return nothing.
      {
        key: 'activity',
        label: 'Activity',
        type: 'multi',
        column: 'r.activity',
        options: 'activities',
        multi: true,
        placeholder: 'Any activity',
        excludeOptions: ['Other'],
      },
      { key: 'treated_by', label: 'Treated By', type: 'enum', column: 'r.treated_by', options: 'staff', managed: true, placeholder: 'Anyone' },
    ],

    fields: [
      { key: 'record_date', label: 'Date', kind: 'date', required: true, col2: false, section: 'visit' },
      { key: 'barangay', label: 'Barangay', kind: 'select', required: true, options: 'barangays', section: 'visit' },
      { key: 'farmer_name', label: "Farmer's Name", kind: 'text', required: true, section: 'farmer' },
      {
        key: 'beneficiary_id',
        label: 'Linked Beneficiary',
        kind: 'beneficiary',
        required: false,
        optional: true,
        section: 'farmer',
        // Not a hard FK: a farmer can be treated before they register, so this
        // only fills farmer_name when someone is picked. Which field it fills is
        // declared rather than assumed by the form, so the name field can be
        // renamed in this config alone.
        fills: 'farmer_name',
        help: 'Picking a registered farmer fills the name above.',
      },
      { key: 'activity', label: 'Activity', kind: 'activity', required: true, options: 'activities', col2: true, section: 'treatment' },
      { key: 'medicine_used', label: 'Medicine Used', kind: 'text', required: true, col2: true, section: 'treatment' },
      // Species is a maintained list like the staff list: the office decides which
      // animals to offer, an admin can add one and remove one, and a value that is
      // not on the stored list is refused.
      {
        key: 'species',
        label: 'Species',
        kind: 'select',
        required: true,
        options: 'species',
        managed: true,
        allowCustom: true,
        customRoles: ['admin', 'super_admin'],
        maxLength: 64,
        section: 'animal',
      },
      { key: 'age_value', label: 'Age', kind: 'number', required: true, min: 1, step: 1, section: 'animal' },
      { key: 'age_unit', label: 'Age Unit', kind: 'select', required: true, options: 'ageUnits', section: 'animal' },
      { key: 'no_of_heads', label: 'No. of Heads', kind: 'number', required: true, min: 1, step: 1, section: 'animal' },
      {
        key: 'treated_by',
        label: 'Treated By',
        // A name from the staff list rather than a login: somebody who carried out
        // the work has to be recordable without an account, and taking them off the
        // list must not edit the records that credit them.
        kind: 'select',
        required: true,
        options: 'staff',
        managed: true,
        allowCustom: true,
        customRoles: ['admin', 'super_admin'],
        section: 'attribution',
      },
      { key: 'notes', label: 'Notes', kind: 'textarea', required: false, optional: true, col2: true, section: 'attribution' },
    ],

    // Cards above the table. `sum` columns are summed over the filtered set so a
    // filtered view reports on what is actually on screen.
    summary: [
      { key: 'records', label: 'Total Records', kind: 'count' },
      { key: 'heads', label: 'Total Heads Treated', kind: 'sum', column: 'r.no_of_heads' },
      { key: 'farmers', label: 'Farmers Reached', kind: 'distinct', column: 'r.farmer_name' },
      {
        key: 'treatments',
        label: 'Treatments Recorded',
        kind: 'count',
        column: 'r.activity',
        // Counts each entry of every activity array rather than the rows, since
        // one visit can carry three activities and is three treatments.
        jsonEntries: true,
        note: 'Activities counted individually',
      },
    ],
  },
};

// Option lists the config refers to by name. Resolved on the server for
// validation and sent to the browser so both sides offer identical choices.
export function resolveOptions(name) {
  switch (name) {
    case 'barangays': return MEDINA_BARANGAYS;
    case 'species': return ANIMAL_HEALTH_SPECIES;
    case 'staff': return ANIMAL_HEALTH_STAFF;
    case 'activities': return ANIMAL_HEALTH_ACTIVITIES;
    case 'ageUnits': return ANIMAL_HEALTH_AGE_UNITS;
    default: return [];
  }
}

// Types are addressable by key (config-facing) or slug (URL-facing), so a route
// parameter of `animal-health` and a config reference of `animalHealth` both
// resolve. Callers should not have to know which form the other one used.
export function getReportType(keyOrSlug) {
  const needle = String(keyOrSlug || '');
  const type = Object.values(REPORT_TYPES).find(
    (candidate) => candidate.key === needle || candidate.slug === needle
  );
  if (!type) {
    const err = new Error(`Unknown report type: ${keyOrSlug}`);
    err.status = 404;
    throw err;
  }
  return type;
}

// Every named list a type refers to, read off the config rather than listed here, so
// a new option list needs no edit here to start reaching the browser.
function optionListNames(type) {
  const names = new Set();
  for (const filter of type.filters) if (filter.options) names.add(filter.options);
  for (const field of type.fields) if (field.options) names.add(field.options);
  return [...names];
}

// What a list resolves to for this request. A managed list (`managedOptions`) is read
// from storage, so an admin's edits are what the browser and the API agree on; a list
// with nothing stored yet falls back to the array in this file, which is what a fresh
// install seeded by hand rather than by migration 012 would have. Everything else is
// config-only and never leaves here.
function resolveOptionsFor(type, name, stored) {
  const isManaged = (type.managedOptions || []).includes(name);
  const storedList = stored?.[name];
  if (isManaged && storedList?.length) return storedList;
  return resolveOptions(name);
}

// The registry minus server-only details (table name, join clauses, SQL column
// references), because none of that should travel to the browser and the route
// handler builds SQL from it. Only what the shell renders is serialised.
//
// `stored` supplies, per type key, the managed option lists as they are in
// report_option_values. It is passed in rather than read here so this stays
// synchronous and the data module keeps no database dependency.
export function serialiseReportTypes(stored = {}) {
  return Object.values(REPORT_TYPES).map((type) => {
    const managed = stored[type.key] || {};
    const options = Object.fromEntries(
      optionListNames(type).map((name) => [name, resolveOptionsFor(type, name, managed)])
    );
    return {
      key: type.key,
      slug: type.slug,
      title: type.title,
      subtitle: type.subtitle,
      sections: type.sections || {},
      noun: type.noun,
      dateColumn: type.dateColumn,
      recordLabel: type.recordLabel,
      exportFilename: type.exportFilename,
      columns: type.columns
        .filter((column) => column.export !== false)
        .map(({ key, label, kind, searchable, align }) => ({ key, label, kind, searchable, align })),
      filters: type.filters.map((filter) => ({
        key: filter.key,
        label: filter.label,
        type: filter.type,
        placeholder: filter.placeholder,
        multi: Boolean(filter.multi),
        // Values that exist in the form but cannot be stored verbatim, so offering
        // them as a filter would only ever produce an empty result.
        options: filter.options
          ? options[filter.options].filter((option) => !(filter.excludeOptions || []).includes(option))
          : undefined,
        // As on a field: the resolved values are sent for the menu, and the list name
        // separately so a removal can be addressed to the list it came from.
        listName: filter.managed ? filter.options : null,
      })),
      fields: type.fields.map((field) => ({
        key: field.key,
        label: field.label,
        kind: field.kind,
        required: Boolean(field.required),
        optional: Boolean(field.optional),
        col2: Boolean(field.col2),
        section: field.section,
        min: field.min,
        step: field.step,
        help: field.help,
        lockForRole: field.lockForRole,
        // Lets an authorised role type a value that is not on the list, and says the
        // list itself is theirs to edit: the form then offers to add an entry and to
        // remove one. The roles are sent so the form can decide what to show, and the
        // server re-checks the role on both the record and the list: the client cannot
        // be trusted to withhold either.
        managed: Boolean(field.managed),
        allowCustom: Boolean(field.allowCustom),
        customRoles: field.customRoles,
        maxLength: field.maxLength || null,
        reserved: field.reserved || null,
        fills: field.fills,
        // The name of the maintained list this field draws on, for a managed field.
        // `options` above has already been resolved into the values themselves, so
        // without this the client would post the option array where the add and
        // remove endpoints expect a list name and be refused as "not maintained here".
        listName: field.managed ? field.options : null,
        options: field.options ? options[field.options] : undefined,
      })),
      summary: type.summary.map((card) => ({
        key: card.key, label: card.label, kind: card.kind, note: card.note,
      })),
    };
  });
}