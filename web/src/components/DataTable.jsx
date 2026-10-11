import React, { useMemo, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Icon from './Icon.jsx';

// Sorting lives here rather than in each page so every table that opts in gets
// identical behaviour: click to sort, click again to flip direction. The parent
// owns the sort state so it can also apply the same order to an export.
export default function DataTable({
  columns,
  rows = [],
  keyField = 'id',
  onRowClick,
  sortKey = null,
  sortDir = 'asc',
  onSort,
  sortable = null,
}) {
  const list = Array.isArray(rows) ? rows : [];

  const sorted = useMemo(() => {
    if (!sortKey) return list;
    // A copy is sorted so the caller's array is never mutated in place.
    return [...list].sort((a, b) => {
      const av = a?.[sortKey];
      const bv = b?.[sortKey];
      // Missing values always sort last, whichever direction is active.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [list, sortKey, sortDir]);

  return (
    <div className="card table-card" style={{ padding: 0 }}>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => {
                if (!c.sortValue) return <th key={c.key}>{c.label}</th>;
                const active = sortKey === c.key;
                const ariaSort = active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
                return (
                  <th key={c.key} aria-sort={ariaSort}>
                    <button
                      type="button"
                      className={`th-sort ${active ? 'active' : ''}`}
                      onClick={() => onSort?.(c.key)}
                    >
                      <span>{c.label}</span>
                      <span className="th-sort-icon" aria-hidden="true">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          {active && sortDir === 'desc'
                            ? <path d="M6 9l6 6 6-6" />
                            : <path d="M6 15l6-6 6 6" />}
                        </svg>
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {!sorted.length && (
              <tr><td className="empty" colSpan={columns.length}>No records found</td></tr>
            )}
            {sorted.map((row, index) => {
              const shared = {
                key: row[keyField],
                className: [
                  onRowClick ? 'clickable' : '',
                  sortable ? 'sortable-row' : '',
                  sortable ? `sortable-handle-${sortable.handle || 'grip'}` : '',
                ].filter(Boolean).join(' ') || undefined,
                tabIndex: onRowClick ? 0 : undefined,
                onClick: onRowClick ? (e) => { if (e.target.closest('button, a, input, select')) return; onRowClick(row); } : undefined,
                onKeyDown: onRowClick ? (e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  onRowClick(row);
                } : undefined,
              };

              if (!sortable) return <tr {...shared}>{columns.map((c) => <td key={c.key}>{c.render ? c.render(row) : (row[c.key] ?? 'N/A')}</td>)}</tr>;

              return (
                <SortableRow
                  key={shared.key}
                  id={row[keyField]}
                  index={index}
                  disabled={Boolean(sortable.disabled)}
                  handle={sortable.handle || 'grip'}
                  {...shared}
                >
                  {columns.map((c) => <td key={c.key}>{c.render ? c.render(row) : (row[c.key] ?? 'N/A')}</td>)}
                </SortableRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// A <tr> that participates in drag reordering. useSortable has to be called once
// per row, and hooks cannot run inside the columns.map above, so the row is a
// component. The drag handle reads the activator props from context instead of
// calling the hook a second time for the same id.
function SortableRow({ id, index, disabled, handle, className, tabIndex, onClick, onKeyDown, children }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
    position: 'relative',
    zIndex: isDragging ? 1 : undefined,
  };

  return (
    <SortableHandleContext.Provider value={{ attributes, listeners, setActivatorNodeRef, handle, disabled }}>
      <tr
        ref={setNodeRef}
        style={style}
        className={className}
        tabIndex={tabIndex}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        {children}
      </tr>
    </SortableHandleContext.Provider>
  );
}

const SortableHandleContext = React.createContext(null);

// The grip that activates a drag. Keyboard users get the dnd-kit defaults
// (space to lift, arrows to move) for free through `attributes`.
export function SortableHandle({ title = 'Drag to reorder' }) {
  const ctx = React.useContext(SortableHandleContext);
  if (!ctx) return null;
  const { attributes, listeners, setActivatorNodeRef, handle, disabled } = ctx;
  return (
    <button
      type="button"
      className="drag-handle"
      ref={setActivatorNodeRef}
      aria-label={title}
      title={title}
      disabled={disabled}
      {...attributes}
      {...listeners}
    >
      <Icon name={handle} size={15} />
    </button>
  );
}