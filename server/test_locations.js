// PSA geographic codes for Medina, Misamis Oriental (region 10, province 43,
// municipality 19), mirrored from mobile/src/data/locations.js.
//
// This data is used by the admin panel to populate the Province -> Barangay -> Purok
// dropdowns in the beneficiary edit/create forms.
//
// The data structure is formatted for the frontend:
// - PROVINCES: Array of {value: province, label: province} objects for the Province dropdown
// - BARANGAY_CODES: Map of barangay name -> PSGC code for reference
// - DEFAULT_PUROKS: Default placeholder purok names for the Purok dropdown
// - PUROK_OVERRIDES: Map for barangay-specific purok overrides (currently empty)

export const MUNICIPALITY_NAME = 'Medina';

export const REGION_CODE = '10';
export const PROVINCE_CODE = '43';
export const MUNICIPALITY_CODE = '19';

// NOTE: PSA does not assign "010" in Medina. The sequence jumps straight from
// 009 (Mananum Daan) to 011 (North Poblacion). Do not "fix" this gap.
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

export const MEDINA_BARANGAYS = Object.keys(BARANGAY_CODES);

// Frontend expects provinces as an array of objects with value and label properties
export const PROVINCES_FRONTEND = MEDINA_BARANGAYS.map((p) => ({ value: p, label: p }));

// Internal reference data for geographic codes
export const PROVINCES = {
  'Misamis Oriental': MEDINA_BARANGAYS,
};

export function getGeoCode(province, barangay) {
  const list = PROVINCES[province] || [];
  if (!barangay || !list.includes(barangay)) return null;
  const barangayCode = BARANGAY_CODES[barangay];
  if (!barangayCode) return null;
  return {
    region: REGION_CODE,
    province: PROVINCE_CODE,
    municipality: MUNICIPALITY_CODE,
    barangay: barangayCode,
    display: `${REGION_CODE} - ${PROVINCE_CODE} - ${MUNICIPALITY_CODE} - ${barangayCode}`,
    digits: `${REGION_CODE}${PROVINCE_CODE}${MUNICIPALITY_CODE}${barangayCode}`,
    padded: `${REGION_CODE}0${PROVINCE_CODE}${MUNICIPALITY_CODE}${barangayCode}`,
  };
}

// Default purok names - these are placeholders that can be overridden by barangay-specific values
export const DEFAULT_PUROKS = [
  'Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5', 'Purok 6', 'Purok 7',
];

// Purok overrides for specific barangays (currently empty - can be populated as needed)
export const PUROK_OVERRIDES = {};

