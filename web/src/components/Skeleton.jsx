import React, { useEffect, useRef, useState } from 'react';

// A single gray loading placeholder. Bars, pills, circles and thumbnails are all
// the same block with different dimensions, so this base takes width/height/radius
// and paints the shared shimmer sweep on top. `prefers-reduced-motion` turns the
// sweep off in CSS and the block becomes a flat gray.
export default function Skeleton({ width = 100, height = 16, radius = 6, className = '', style, live = true }) {
  return (
    <span
      aria-hidden="true"
      className={`skeleton${live ? ' skeleton-live' : ''}${className ? ` ${className}` : ''}`}
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

// A skeleton should only appear when data is genuinely slow. A fast fetch that
// lands in under `showDelay` ms renders nothing; anything slower shows a skeleton
// held for at least `minVisible` ms so it does not flash in and out.
export function useSkeletonVisible(loading, { showDelay = 150, minVisible = 300 } = {}) {
  const [visible, setVisible] = useState(false);
  const gate = useRef({ shown: false, showTimer: null, hideTimer: null });

  useEffect(() => {
    const g = gate.current;
    if (loading) {
      if (g.hideTimer) { clearTimeout(g.hideTimer); g.hideTimer = null; }
      if (!g.shown) {
        g.showTimer = setTimeout(() => { g.shown = true; setVisible(true); }, showDelay);
      }
    } else {
      if (g.showTimer) { clearTimeout(g.showTimer); g.showTimer = null; }
      if (g.shown) g.hideTimer = setTimeout(() => { g.shown = false; setVisible(false); }, minVisible);
      else setVisible(false);
    }
    return () => {
      if (g.showTimer) clearTimeout(g.showTimer);
      if (g.hideTimer) clearTimeout(g.hideTimer);
      g.showTimer = null;
      g.hideTimer = null;
    };
  }, [loading, showDelay, minVisible]);

  return visible;
}

// Visually hidden live region that tells a screen reader "loading" is happening.
// Rendered once per page; every region behind it also carries aria-busy so the
// announce comes with a settled state to fall back on.
export function LoadingStatus({ active }) {
  return (
    <span className="sr-only" role="status" aria-live="polite" aria-busy={active}>
      {active ? 'Loading' : ''}
    </span>
  );
}

// Deterministic pseudo-randomness keeps the skeleton from flickering the same bar
// widths on every render and -- unlike Math.random -- is stable across SSR/re-renders.
function barWidth(row, col, base = 40, step = 10) {
  return base + ((row * 7 + col * 13) % 5) * step;
}

// Which shape a column's placeholder should take. Status columns get a pill, action
// /empty-header columns a small hint, the rest a text bar. `cellVariants` lets a
// page force a specific shape (e.g. an image thumbnail for the carousel caption).
function cellVariant(col, explicit) {
  if (explicit) return explicit;
  const key = col.key || '';
  if (/status|role|type|category|sms|tone/i.test(key)) return 'pill';
  if (key === 'actions' || (col.label || '') === '') return 'hint';
  return 'bar';
}

// A placeholder for any DataTable. Renders the real header row (same labels, same
// row height) so the layout does not jump when the data lands, then `rows` skeleton
// rows whose cells are sized to the column's content kind at 40-90% width.
export function TableSkeleton({ columns = [], rows = 6, cellVariants = {}, ariaLabel = 'Loading', bare = false }) {
  return (
    <div
      className={bare ? 'table-bare' : 'card table-card'}
      style={bare ? undefined : { padding: 0 }}
      aria-busy="true"
      aria-label={ariaLabel}
    >
      <div className="table-wrap">
        <table className="table skeleton-table">
          <thead>
            <tr>
              {columns.map((col) => <th key={col.key || col.label}>{col.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                {columns.map((col, c) => {
                  switch (cellVariant(col, cellVariants[col.key])) {
                    case 'thumb':
                      return (
                        <td key={col.key || c}>
                          <span className="skeleton-thumb-row">
                            <Skeleton width={56} height={40} radius={8} />
                            <Skeleton width={barWidth(r, c, 90, 18)} height={12} radius={4} />
                          </span>
                        </td>
                      );
                    case 'pill':
                      return (
                        <td key={col.key || c}>
                          <Skeleton width={44} height={16} radius={99} />
                        </td>
                      );
                    case 'hint':
                      return (
                        <td key={col.key || c} style={{ textAlign: 'right' }}>
                          <Skeleton width={22} height={13} radius={4} />
                        </td>
                      );
                    default: {
                      const nameish = /name|title|subject|question|answer|detail|remarks/i.test(col.key || '');
                      return (
                        <td key={col.key || c}>
                          <Skeleton width={barWidth(r, c, nameish ? 66 : 40, nameish ? 16 : 10)} height={12} radius={4} />
                        </td>
                      );
                    }
                  }
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StatCardSkeleton({ cards = 4 }) {
  const list = typeof cards === 'number'
    ? Array.from({ length: cards }, (_, i) => ({ variant: i === 2 ? 'primary' : '' }))
    : cards;

  return (
    <div className="dash-kpis">
      {list.map((c, i) => (
        <div
          key={i}
          className={`card dash-card dash-kpi${c.variant === 'primary' ? ' dash-kpi--primary' : ''}`}
        >
          <Skeleton width={40} height={40} radius={12} />
          <Skeleton width={96} height={12} radius={4} />
          <Skeleton width={66} height={32} radius={6} />
          <Skeleton width={112} height={13} radius={4} />
        </div>
      ))}
    </div>
  );
}

// Placeholder for a chart card: a title bar over a block that hints at the chart.
// `kind` picks the shape ('bars' or 'donut'); the block keeps the card's real
// height so nothing shifts when the chart mounts.
export function ChartCardSkeleton({ kind = 'bars', height = 220 }) {
  const bars = [38, 62, 45, 80, 56, 70, 90, 48, 66, 52, 74, 60];
  return (
    <div className="card skeleton-chart-card">
      <Skeleton width={140} height={15} radius={4} />
      <div className="skeleton-chart-body" style={{ height }}>
        {kind === 'donut' ? (
          <Skeleton width={140} height={140} radius={70} />
        ) : (
          <div className="skeleton-chart-bars" style={{ height }}>
            {bars.map((h, i) => <Skeleton key={i} width={18} height={h} radius={4} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// Placeholder for a page header's title/subtitle. Pages keep their real titles
// visible while loading, so this exists as a building block for screens that
// would otherwise render `Loading…`.
export function PageHeaderSkeleton({ titleWidth = 180 }) {
  return (
    <>
      <Skeleton width={titleWidth} height={24} radius={5} />
      <Skeleton width={300} height={14} radius={4} />
    </>
  );
}

// Placeholder for a tab strip: a few tab pill rows with a count pill on each.
export function TabsSkeleton({ tabs = 3 }) {
  return (
    <div className="tabs-skeleton" aria-hidden="true">
      {Array.from({ length: tabs }, (_, i) => (
        <span key={i} className="tabs-skeleton-tab">
          <Skeleton width={70 + (i % 2) * 26} height={14} radius={4} />
          <Skeleton width={24} height={13} radius={7} />
        </span>
      ))}
    </div>
  );
}

// Placeholder for the search/filter row of a records page.
export function FiltersSkeleton({ controls = 3 }) {
  return (
    <div className="filter-skeleton-row" aria-hidden="true">
      <Skeleton width={280} height={34} radius={20} />
      {Array.from({ length: controls }, (_, i) => (
        <Skeleton key={i} width={150 + (i % 3) * 30} height={34} radius={8} />
      ))}
    </div>
  );
}

// Placeholder for a list of accordion rows (landing content sections).
export function ListSkeleton({ rows = 5 }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <div className="card landing-skeleton-item" key={r} aria-hidden="true">
          <Skeleton width={16} height={16} radius={4} />
          <Skeleton width={110 + (Math.abs(r * 37) % 60)} height={14} radius={4} />
          <Skeleton width={24} height={14} radius={4} />
        </div>
      ))}
    </>
  );
}

// Placeholder for a modal form: label-height bars over input-sized bars, ending in
// a skeleton button row. Pages currently open their forms from already-loaded row
// state, so this is only exercised where a modal genuinely waits for data.
export function FormSkeleton({ fields = 4, rows = 2 }) {
  return (
    <div className="form-grid form-skeleton" aria-hidden="true">
      {Array.from({ length: fields }, (_, i) => (
        <div className="form-grid-cell" key={i}>
          <Skeleton width={90} height={11} radius={3} />
          <Skeleton width="100%" height={38} radius={8} />
        </div>
      ))}
      {Array.from({ length: rows }, (_, i) => (
        <div className="form-grid-cell form-skeleton-span" key={`r${i}`}>
          <Skeleton width={120} height={11} radius={3} />
          <Skeleton width="100%" height={64} radius={8} />
        </div>
      ))}
      <div className="modal-actions form-skeleton-actions">
        <Skeleton width={88} height={36} radius={8} />
        <Skeleton width={110} height={36} radius={8} />
      </div>
    </div>
  );
}