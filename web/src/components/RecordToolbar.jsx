import React from 'react';
import Icon from './Icon.jsx';
import DateRangePicker from './DateRangePicker.jsx';
import Skeleton from './Skeleton.jsx';

// From/to pair. The native date inputs were replaced by a branded calendar
// popover, which constrains each end to the other so an impossible range cannot
// be entered.
export function DateRangeFilter({ from, to, onFromChange, onToChange, fromLabel = 'From', toLabel = 'To' }) {
  return (
    <DateRangePicker
      from={from}
      to={to}
      onFromChange={onFromChange}
      onToChange={onToChange}
      fromLabel={fromLabel}
      toLabel={toLabel}
    />
  );
}

// The search/filter/action bar shared by every records page. `children` is the
// filter controls, `actions` anything extra on the right such as an export button.
// `metaLoading` turns the record-count line into a skeleton pill; the search box,
// filters and actions stay interactive while data loads.
export default function RecordToolbar({
  searchPlaceholder = 'Search…',
  searchValue = '',
  onSearch,
  children,
  onClearFilters,
  clearLabel = 'Clear filters',
  actions,
  meta,
  metaLoading = false,
}) {
  return (
    <>
      <div className="toolbar">
        <div className="search-pill">
          <Icon name="search" size={15} />
          <input
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearch?.(e.target.value)}
          />
          {searchValue && (
            <button
              type="button"
              className="search-clear"
              aria-label="Clear search"
              onClick={() => onSearch?.('')}
            >
              <Icon name="x" size={13} />
            </button>
          )}
        </div>

        <div className="toolbar-filters">{children}</div>

        <div className="toolbar-actions">
          {onClearFilters && (
            <button type="button" className="btn-pill" onClick={onClearFilters}>
              {clearLabel}
            </button>
          )}
          {actions}
        </div>
      </div>

      {meta != null && (
        <div className="toolbar-meta">
          {metaLoading
            ? <Skeleton width={170} height={13} radius={4} />
            : <p className="record-count">{meta}</p>}
        </div>
      )}
    </>
  );
}