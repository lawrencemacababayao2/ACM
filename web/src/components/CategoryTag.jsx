import React from 'react';
import { CATEGORY_LABELS } from '../lib/categories.js';

// Small neutral tag for tables and detail panels. Category is a topic, not a
// status or an audience, so it never takes one of the coloured badge tones --
// that would make it read as one of those.
export default function CategoryTag({ value }) {
  if (!value) return <span className="muted">—</span>;
  return <span className="text-badge text-gray">{CATEGORY_LABELS[value] || value}</span>;
}
