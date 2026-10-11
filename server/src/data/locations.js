// Location data for the admin beneficiary forms.
//
// This mirrors mobile/src/data/locations.js, which is the source of truth for
// the registration wizard. Province / Barangay / Purok form a dependency chain:
// choosing a parent narrows the options of the child, so a Purok can never be
// picked from a different Barangay.
//
// The MAO only serves the Municipality of Medina, so the province list is
// intentionally limited to its service area. Add entries here (or move this
// data to a `locations` table) if the coverage widens.

export const MUNICIPALITY_NAME = 'Medina';
export const REGION_NAME = 'Northern Mindanao';

// ---------------------------------------------------------------------------
// PSGC / RSBSA geographic codes - reference only.
//
// The admin panel never displays these and never fills them in: the farmer
// types the whole RSBSA number themselves and the MAO verifies it. They are kept
// here because getGeoCode() below is the admin-side reference for what the
// leading digits of an RSBSA number mean.
// ---------------------------------------------------------------------------
export const REGION_CODE = '10';
export const PROVINCE_CODE = '43';
export const MUNICIPALITY_CODE = '19';

// NOTE: PSA does not assign "010" in Medina. The sequence jumps straight from
// 009 (Mananum Daan) to 011 (North Poblacion). Do not "fix" this gap - real
// RSBSA numbers use these exact ordinals.
export const BARANGAY_CODES = {
  'Bangbang': '001',
  'Bulwa': '002',
  'Cabug': '003',
  'Dig-aguyan': '004',
  'Duka': '005',
  'Gasa': '006',
  'Maanas': '007',
  'Mananum Bag-o': '008',
  'Mananum Daan': '009',
  'North Poblacion': '011',
  'Pahindong': '012',
  'Portulin': '013',
  'San Isidro': '014',
  'San Jose': '015',
  'San Roque': '016',
  'San Vicente': '017',
  'South Poblacion': '018',
  'Tambagan': '019',
  'Tup-on': '020',
};

// Misamis Oriental is the province of Medina, Misamis Oriental.
// The 19 barangays below are the official subdivisions of Medina, in the same
// order as BARANGAY_CODES above.
export const MEDINA_BARANGAYS = Object.keys(BARANGAY_CODES);

export const LOCATIONS = {
  'Misamis Oriental': MEDINA_BARANGAYS,
};

// Purok (sitio) names are maintained locally by each barangay and are not
// published in an official list, so these numbered entries are placeholders.
// Replace them with the real purok names for a barangay by adding a
// PUROK_OVERRIDES entry keyed by "Barangay".
export const PUROK_OVERRIDES = {};

const DEFAULT_PUROKS = [
  'Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5', 'Purok 6', 'Purok 7',
];

export function getProvinces() {
  return Object.keys(LOCATIONS).map((p) => ({ value: p, label: p }));
}

export function getBarangays(province) {
  const list = LOCATIONS[province] || [];
  return list.map((b) => ({ value: b, label: b }));
}

export function getPuroks(province, barangay) {
  // A purok is only offered when the barangay really belongs to the chosen
  // province, so a stale or mismatched value can never surface options.
  const list = LOCATIONS[province] || [];
  if (!barangay || !list.includes(barangay)) return [];
  const overridden = PUROK_OVERRIDES[barangay];
  const puroks = overridden && overridden.length ? overridden : DEFAULT_PUROKS;
  return puroks.map((p) => ({ value: p, label: p }));
}

// Returns the geographic portion of an RSBSA number for the chosen location, so
// the leading digits of an RSBSA number can be explained during review.
//
// Returns null until both the province and the barangay are known.
//
// `digits` is the display form ("104319003") and `padded` is the same code in
// the official 10-digit PSGC layout ("1004319003").
export function getGeoCode(province, barangay) {
  const list = LOCATIONS[province] || [];
  if (!barangay || !list.includes(barangay)) return null;
  const barangayCode = BARANGAY_CODES[barangay];
  if (!barangayCode) return null;

  return {
    region: REGION_CODE,
    province: PROVINCE_CODE,
    municipality: MUNICIPALITY_CODE,
    municipalityName: MUNICIPALITY_NAME,
    barangay: barangayCode,
    barangayName: barangay,
    display: `${REGION_CODE} - ${PROVINCE_CODE} - ${MUNICIPALITY_CODE} - ${barangayCode}`,
    digits: `${REGION_CODE}${PROVINCE_CODE}${MUNICIPALITY_CODE}${barangayCode}`,
    padded: `${REGION_CODE}0${PROVINCE_CODE}${MUNICIPALITY_CODE}${barangayCode}`,
  };
}

// The whole option tree, so the admin form applies the same dependency rules
// the registration wizard does. Purok options are keyed by barangay because a
// barangay belongs to exactly one province, and an unknown province or barangay
// simply has no entry, which is how the wizard's empty-result case is expressed.
//
// Only the labels travel to the browser; the PSGC codes above stay server-side.
export function getLocationOptions() {
  const provinces = getProvinces();
  const barangaysByProvince = {};
  const puroksByBarangay = {};

  for (const province of provinces) {
    const name = province.value;
    barangaysByProvince[name] = getBarangays(name);
    for (const barangay of barangaysByProvince[name]) {
      puroksByBarangay[barangay.value] = getPuroks(name, barangay.value);
    }
  }

  return { provinces, barangaysByProvince, puroksByBarangay };
}