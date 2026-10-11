import React from 'react';
import Icon from './Icon.jsx';

// The organised detail layout used by every records modal: an identity header
// with badges, then labelled sections of a two-column detail grid. Kept in one
// place so the pages cannot drift apart.

// One label/value pair. `wide` spans both columns, for long text and lists.
export function DetailItem({ label, children, wide = false }) {
  return (
    <div className={`detail-item ${wide ? 'is-wide' : ''}`}>
      <span className="detail-label">{label}</span>
      <span className="detail-value">{children}</span>
    </div>
  );
}

// A titled group of DetailItems.
export function DetailSection({ icon, title, children }) {
  return (
    <section>
      <h4 className="profile-section-title">
        {icon && <Icon name={icon} size={14} />}
        {title}
      </h4>
      <div className="details-grid">{children}</div>
    </section>
  );
}

// Identity header: the record's name, a muted reference line, and status badges.
export function ProfileHead({ name, sub, children }) {
  return (
    <div className="profile-head">
      <div className="profile-identity">
        <h3 className="profile-name">{name}</h3>
        {sub && <p className="profile-sub">{sub}</p>}
        {children && <div className="profile-badges">{children}</div>}
      </div>
    </div>
  );
}

export default function RecordProfile({ children }) {
  return <div className="record-profile">{children}</div>;
}