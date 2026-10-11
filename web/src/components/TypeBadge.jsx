import React from 'react';

// Beneficiary type is a category, not a workflow state. Display plain text with
// per-type colors, no pill-shaped badge styling.
const MAP = {
  farmer: { tone: 'green', label: 'Farmer' },
  fisherfolk: { tone: 'blue', label: 'Fisherfolk' },
  livestock_owner: { tone: 'amber', label: 'Livestock Owner' },
};

export default function TypeBadge({ value, label }) {
  const entry = MAP[value];
  if (!entry) return <span className="text-badge text-gray">{label || value?.replace(/_/g, ' ') || 'N/A'}</span>;
  return <span className={`text-badge text-${entry.tone}`}>{label || entry.label}</span>;
}