import React from 'react';

const MAP = {
  pending: 'amber',
  draft: 'amber',
  published: 'green',
  verified: 'green',
  rejected: 'red',
  approved: 'green',
  scheduled: 'blue',
  in_progress: 'blue',
  completed: 'green',
  active: 'green',
  upcoming: 'blue',
  ongoing: 'green',
  closed: 'gray',
  cancelled: 'red',
  sent: 'green',
  log: 'purple',
  failed: 'red',
  all: 'gray',
  farmer: 'green',
  fisherfolk: 'blue',
  livestock_owner: 'amber',
  announcement: 'gray',
  program: 'green',
  training: 'blue',
  general: 'gray',
  crop: 'green',
  livestock: 'purple',
  fisheries: 'blue',
  service: 'green',
  equipment: 'blue',
  profile_correction: 'purple',
  admin: 'blue',
  super_admin: 'purple',
  inactive: 'red',
};

export default function StatusBadge({ value, label, color }) {
  const cls = color || MAP[value] || 'gray';
  // An ongoing activity gets a breathing dot so it reads live, not finished.
  return (
    <span className={`text-badge text-${cls}`}>
      {value === 'ongoing' && <span className="pulse-dot" />}
      {label || value.replace(/_/g, ' ')}
    </span>
  );
}