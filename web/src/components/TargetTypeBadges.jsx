import React from 'react';
import { normalizeTypes } from '../lib/targetTypes.js';

// Shows a row's full target audience without opening it.
//
// Past two entries the list is truncated to "Farmer, Fisherfolk +1" rather than
// stacking badges: the target column sits in a fixed-width table, and a
// three-badge cell pushes every other column off screen. The count stays visible
// so nothing is silently dropped -- the full set is one row click away, and the
// detail panel always lists every type.
const MAX_INLINE = 2;

const LABELS = {
  all: 'All',
  farmer: 'Farmer',
  fisherfolk: 'Fisherfolk',
  livestock_owner: 'Livestock Owner',
  public: 'Open to everyone',
};

// Same hues as the .chip-* rules and StatusBadge's map, so one type never
// appears in two colours. 'public' gets purple: it is the only audience that is
// not a registered beneficiary, and none of the registered-group hues (green /
// blue / amber / gray) reads as "unregistered visitors".
const TONES = {
  all: 'gray',
  farmer: 'green',
  fisherfolk: 'blue',
  livestock_owner: 'amber',
  public: 'purple',
};

export default function TargetTypeBadges({ row }) {
  const list = normalizeTypes(row?.target_beneficiary_types ?? row?.target_type);
  if (!list.length) return <span className="muted">—</span>;

  const shown = list.slice(0, MAX_INLINE);
  const extra = list.length - shown.length;

  return (
    <span className="target-badges">
      {shown.map((t) => (
        <span key={t} className={`text-badge text-${TONES[t] || 'gray'}`}>
          {LABELS[t] || t}
        </span>
      ))}
      {extra > 0 && (
        <span className="text-badge text-gray" title={list.map((t) => LABELS[t] || t).join(', ')}>
          +{extra}
        </span>
      )}
    </span>
  );
}