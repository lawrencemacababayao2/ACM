// Per-beneficiary-type request catalog. This is the server's source of truth for
// what a beneficiary is allowed to request and which answers each option needs,
// so the rule cannot be bypassed by posting straight to the API. The mobile app
// keeps a mirror of this shape in mobile/src/data/requestConfig.js (with labels
// in both languages and the option photos) and renders its form from it.

export const BENEFICIARY_TYPES = ['farmer', 'fisherfolk', 'livestock_owner'];

const DEFAULT_TARGET_OPTIONS = [
  { value: 'all', label: 'All' },
];

// Which profile field supplies the ID number for a type, and how it is labelled.
const ID_BY_TYPE = {
  fisherfolk: { key: 'id_number', label: 'FishR ID number', source: 'fishr_number' },
  farmer: { key: 'id_number', label: 'RSBSA / Farmer ID number', source: 'rsbsa_number' },
};

// Profile details that ride along with every request. Autofilled from the
// beneficiary record but editable, and required so the MAO can always reach
// the requester.
export const PROFILE_FIELDS = [
  { key: 'full_name', label: 'Full name', kind: 'text', required: true },
  { key: 'contact_number', label: 'Contact number', kind: 'text', required: true },
  { key: 'barangay', label: 'Barangay', kind: 'text', required: true },
];

// Common trailing fields: both optional.
export const REMARKS_FIELD = { key: 'remarks', label: 'Remarks', kind: 'text', required: false };

export const REQUEST_CONFIG = {
  fisherfolk: {
    heading: 'Fisherfolk requests',
    id: ID_BY_TYPE.fisherfolk,
    options: [
      {
        id: 'payao',
        label: 'Fish Aggregating Device (payao)',
        type: 'equipment',
        quantityKey: 'quantity',
        fields: [
          { key: 'quantity', label: 'Quantity (units)', kind: 'number', required: true, min: 1 },
          { key: 'deployment_area', label: 'Deployment area / fishing ground', kind: 'text', required: true },
          { key: 'boat', label: 'Fishing boat name or registration', kind: 'text', required: false },
          { key: 'association', label: 'Fishing association or cooperative', kind: 'text', required: false },
        ],
      },
      {
        id: 'norwegian-fish-cage',
        label: 'Norwegian fish cage',
        type: 'equipment',
        quantityKey: 'quantity',
        fields: [
          { key: 'quantity', label: 'Quantity (units)', kind: 'number', required: true, min: 1 },
          { key: 'cage_site', label: 'Cage site (barangay or water body)', kind: 'text', required: true },
          { key: 'species', label: 'Species to culture', kind: 'text', required: true },
          { key: 'cage_size', label: 'Cage size', kind: 'text', required: false },
          { key: 'association', label: 'Fishing association or cooperative', kind: 'text', required: false },
        ],
      },
    ],
  },

  farmer: {
    heading: 'Farmer requests',
    id: ID_BY_TYPE.farmer,
    options: [
      {
        id: 'carabao',
        label: 'Carabao',
        type: 'equipment',
        quantityKey: 'quantity',
        fields: [
          { key: 'quantity', label: 'Quantity (heads)', kind: 'number', required: true, min: 1 },
          {
            key: 'purpose', label: 'Purpose', kind: 'select', required: true,
            choices: [
              { value: 'plowing', label: 'Plowing' },
              { value: 'hauling', label: 'Hauling' },
              { value: 'breeding', label: 'Breeding' },
            ],
          },
          { key: 'farm_area', label: 'Farm area (ha)', kind: 'number', required: true, min: 0 },
          { key: 'farm_location', label: 'Farm location', kind: 'text', required: true },
        ],
      },
      {
        id: 'tractor',
        label: 'Tractor',
        type: 'equipment',
        quantityKey: null,
        fields: [
          {
            key: 'service_needed', label: 'Service needed', kind: 'select', required: true,
            choices: [
              { value: 'plowing', label: 'Plowing' },
              { value: 'harrowing', label: 'Harrowing' },
              { value: 'other', label: 'Other' },
            ],
          },
          { key: 'farm_area', label: 'Farm area (ha)', kind: 'number', required: true, min: 0 },
          { key: 'farm_location', label: 'Farm location', kind: 'text', required: true },
          { key: 'crop', label: 'Crop planted', kind: 'text', required: true },
          { key: 'preferred_schedule', label: 'Preferred schedule', kind: 'text', required: true },
        ],
      },
      {
        id: 'fertilizer',
        label: 'Fertilizer',
        type: 'service',
        quantityKey: 'quantity',
        fields: [
          {
            key: 'fertilizer_type', label: 'Fertilizer type', kind: 'select', required: true,
            choices: [
              { value: 'corn-microbial', label: 'Corn microbial fertilizer' },
              { value: 'ammonium-sulfate', label: 'Ammonium sulfate' },
              { value: 'complete', label: 'Complete fertilizer' },
              { value: 'organic', label: 'Organic fertilizer' },
            ],
          },
          { key: 'quantity', label: 'Quantity (bags)', kind: 'number', required: true, min: 1 },
          { key: 'crop', label: 'Crop', kind: 'text', required: true },
          { key: 'farm_area', label: 'Farm area (ha)', kind: 'number', required: true, min: 0 },
          { key: 'farm_location', label: 'Farm location', kind: 'text', required: true },
        ],
      },
    ],
  },

  livestock_owner: {
    heading: 'Livestock owner requests',
    id: null,
    options: [
      {
        id: 'animal-inspection',
        label: 'Animal inspection',
        type: 'service',
        quantityKey: null,
        fields: [
          {
            key: 'animal_type', label: 'Animal type', kind: 'select', required: true,
            choices: [
              { value: 'swine', label: 'Swine' },
              { value: 'poultry', label: 'Poultry' },
              { value: 'cattle', label: 'Cattle' },
              { value: 'carabao', label: 'Carabao' },
              { value: 'goat', label: 'Goat' },
              { value: 'other', label: 'Other' },
            ],
          },
          { key: 'animal_location', label: 'Animal location / farm address', kind: 'text', required: true },
          {
            key: 'purpose', label: 'Purpose', kind: 'select', required: true,
            choices: [
              { value: 'health-check', label: 'Health check' },
              { value: 'transport-permit', label: 'Transport permit' },
              { value: 'slaughter', label: 'Slaughter' },
              { value: 'sale', label: 'Sale' },
            ],
          },
        ],
      },
      {
        id: 'vaccination',
        label: 'Vaccination',
        type: 'service',
        quantityKey: 'number_of_animals',
        fields: [
          {
            key: 'animal_type', label: 'Animal type', kind: 'select', required: true,
            choices: [
              { value: 'swine', label: 'Swine' },
              { value: 'poultry', label: 'Poultry' },
              { value: 'cattle', label: 'Cattle' },
              { value: 'carabao', label: 'Carabao' },
              { value: 'goat', label: 'Goat' },
              { value: 'other', label: 'Other' },
            ],
          },
          { key: 'number_of_animals', label: 'Number of animals', kind: 'number', required: true, min: 1 },
          {
            key: 'vaccine_type', label: 'Vaccine type', kind: 'select', required: true,
            choices: [
              { value: 'iron', label: 'Iron' },
              { value: 'deworming', label: 'Deworming' },
              { value: 'vitamins', label: 'Vitamins' },
              { value: 'antibiotic', label: 'Antibiotic' },
              { value: 'anti-rabies', label: 'Anti-rabies' },
            ],
          },
          { key: 'animal_location', label: 'Animal location / farm address', kind: 'text', required: true },
        ],
      },
    ],
  },

  supply: {
    heading: 'Supply requests',
    id: ID_BY_TYPE.farmer,
    options: [
      {
        id: 'fertilizer-supply',
        label: 'Fertilizer',
        type: 'supply',
        quantityKey: 'quantity',
        fields: [
          { key: 'quantity', label: 'Quantity (bags)', kind: 'number', required: true, min: 1 },
          { key: 'fertilizer_type', label: 'Fertilizer type', kind: 'select', required: true,
            choices: [
              { value: 'corn-microbial', label: 'Corn microbial fertilizer' },
              { value: 'ammonium-sulfate', label: 'Ammonium sulfate' },
              { value: 'complete', label: 'Complete fertilizer' },
              { value: 'organic', label: 'Organic fertilizer' },
            ],
          },
          { key: 'crop', label: 'Crop', kind: 'text', required: true },
          { key: 'farm_area', label: 'Farm area (ha)', kind: 'number', required: true, min: 0 },
          { key: 'farm_location', label: 'Farm location', kind: 'text', required: true },
        ],
      },
    ],
  },
};

// Accepts a single type, a comma-separated string, or an array and returns the
// known types in a stable order (drops blanks/duplicates/unknowns).
export function normalizeBeneficiaryTypes(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(',');
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const t = String(item || '').trim().toLowerCase();
    if (BENEFICIARY_TYPES.includes(t) && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

export function optionForType(type, optionId) {
  const cfg = REQUEST_CONFIG[type];
  if (!cfg) return null;
  return cfg.options.find((o) => o.id === optionId) || null;
}

export function profileFieldsForType(type) {
  const id = REQUEST_CONFIG[type]?.id;
  const fields = [...PROFILE_FIELDS];
  if (id) fields.push({ key: id.key, label: id.label, kind: 'text', required: true });
  return fields;
}

function isNumber(value, min) {
  if (value == null || value === '') return false;
  if (!/^\d+(\.\d+)?$/.test(String(value).trim())) return false;
  return Number(value) >= (min ?? 1);
}

// Validates one submission against the catalog. Returns the matched option plus
// the parsed quantity, or throws an array of { field, message } the caller
// turns into a 400.
export function validateSubmission(type, optionId, fields) {
  const option = optionForType(type, optionId);
  if (!option) {
    return {
      errors: [{ field: 'option', message: 'This request is not available for your beneficiary type.' }],
    };
  }

  const values = fields && typeof fields === 'object' ? fields : {};
  const errors = [];

  for (const f of profileFieldsForType(type)) {
    const v = values[f.key];
    if (f.required && (v == null || String(v).trim() === '')) {
      errors.push({ field: f.key, message: `${f.label} is required.` });
    }
  }

  for (const f of option.fields) {
    const v = values[f.key];
    const blank = v == null || String(v).trim() === '';
    if (f.required && blank) {
      errors.push({ field: f.key, message: `${f.label} is required.` });
      continue;
    }
    if (blank) continue;
    if (f.kind === 'number' && !isNumber(v, f.min)) {
      errors.push({ field: f.key, message: `${f.label} must be a number of at least ${f.min ?? 1}.` });
    }
    if (f.kind === 'select' && !f.choices.some((c) => c.value === String(v))) {
      errors.push({ field: f.key, message: `Choose a valid ${f.label.toLowerCase()}.` });
    }
  }

  if (errors.length) return { errors, option };

  const quantity = option.quantityKey ? Math.round(Number(values[option.quantityKey])) : 1;
  return { option, quantity };
}

// Builds the human-readable summary stored in requests.details, so the admin
// Requests screens (which already render `details`) keep working without change.
export function buildDetails(type, option, fields) {
  const values = fields || {};
  const lines = [];
  for (const f of profileFieldsForType(type)) {
    const v = values[f.key];
    if (v != null && String(v).trim() !== '') lines.push(`${f.label}: ${String(v).trim()}`);
  }
  for (const f of option.fields) {
    const v = values[f.key];
    if (v == null || String(v).trim() === '') continue;
    let shown = String(v).trim();
    if (f.kind === 'select') {
      const choice = f.choices.find((c) => c.value === shown);
      if (choice) shown = choice.label;
    }
    lines.push(`${f.label}: ${shown}`);
  }
  return lines.join('\n');
}
