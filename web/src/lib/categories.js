// The category vocabulary shared by the admin pages (and matching the server's
// `CATEGORIES` list in server/src/lib/publication.js). Stored as slugs, shown
// with these labels, so "pets" never reaches a screen as a raw slug.

export const CATEGORY_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'livestock', label: 'Livestock' },
  { value: 'crops', label: 'Crops' },
  { value: 'fisheries', label: 'Fisheries' },
  { value: 'pets', label: 'Pets & Animal Health' },
  { value: 'general', label: 'General' },
];

export const CATEGORY_LABELS = CATEGORY_OPTIONS.reduce(
  (acc, o) => (o.value ? { ...acc, [o.value]: o.label } : acc),
  {}
);
