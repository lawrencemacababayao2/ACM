import React from 'react';
import Skeleton from './Skeleton.jsx';

// Underlined status filters with a live count per tab. The count reflects every
// other active filter but not the status itself, so each tab shows how many rows it
// would yield rather than the size of the whole collection.
// `actions` puts page action buttons on the same row as the tabs, pinned to the
// far edge, so headers stay clean on every screen that uses tabs.
// `countsLoading` swaps the numbers for small skeleton pills while keeping the tab
// labels and their click behaviour intact.
export default function StatusTabs({
  tabs = [],
  value,
  onChange,
  label = 'Filter by status',
  actions = null,
  countsLoading = false,
}) {
  return (
    <div className="status-tabs">
      <div className="status-tabs-list" role="tablist" aria-label={label}>
        {tabs.map((tab) => {
          const isActive = value === tab.value;
          const count = tab.count ?? 0;
          let countClass = "";
          if (tab.sidebarCount) {
            countClass = countsLoading || count === 0 ? "zero" : "red";
          } else if (tab.tone === "amber") {
            countClass = "amber";
          } else if (tab.tone === "green") {
            countClass = "green";
          }
          return (
            <button
              key={tab.value || 'all'}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`status-tab ${isActive ? 'active' : ''}`}
              onClick={() => onChange?.(tab.value)}
            >
              <span>{tab.label}</span>
              <span className={`status-tab-count ${countClass}`}>
                {countsLoading
                  ? <Skeleton width={22} height={13} radius={7} style={{ verticalAlign: -1 }} />
                  : ` ${count}`}
              </span>
            </button>
          );
        })}
      </div>
      {actions ? <div className="status-tabs-actions">{actions}</div> : null}
    </div>
  );
}