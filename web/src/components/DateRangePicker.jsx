import React, { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import CalendarGrid from './CalendarGrid.jsx';
import { useDismissOnOutside, usePopoverPlacement } from './usePopover.js';
import { formatDay, formatRange, monthStart, parseISO, sameDay, toISO } from '../lib/dateUtils.js';

export default function DateRangePicker({
  from,
  to,
  onFromChange,
  onToChange,
  fromLabel = 'From',
  toLabel = 'To',
  placeholder = 'Date range',
  id,
}) {
  const [open, setOpen] = useState(false);
  // First click of a new range. Null once the range is settled.
  const [pendingStart, setPendingStart] = useState(null);
  const [view, setView] = useState(() => monthStart(from ? parseISO(from) : new Date()));
  const ref = useRef(null);
  const triggerRef = useRef(null);
  const popRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);
  useDismissOnOutside(open, ref, close);
  const pos = usePopoverPlacement(open, triggerRef, popRef);

  // Follow the range when it is changed from outside, e.g. Clear filters.
  useEffect(() => {
    if (from) setView(monthStart(parseISO(from)));
  }, [from]);

  const fromDate = from ? parseISO(from) : null;
  const toDate = to ? parseISO(to) : null;
  const isActive = Boolean(from || to);

  // While a range is being chosen, the live preview spans from the pending start
  // to the hovered-so-far value rather than the committed range.
  const lo = pendingStart || fromDate;
  const hi = pendingStart ? null : toDate;

  const shiftMonth = (delta) => setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));

  const handleDayClick = (day) => {
    const iso = toISO(day);

    if (!pendingStart) {
      // Start of a new range. Any existing end that now precedes the start is
      // dropped rather than left inverted.
      onFromChange?.(iso);
      if (toDate && toDate < day) onToChange?.('');
      setPendingStart(day);
      return;
    }

    // Second click closes the range. Clicking an earlier day swaps the ends
    // instead of producing a backwards range. The popover closes once the range
    // is complete, matching how the filter pills dismiss on selection.
    if (day < pendingStart) {
      onToChange?.(toISO(pendingStart));
      onFromChange?.(iso);
    } else {
      onFromChange?.(toISO(pendingStart));
      onToChange?.(iso);
    }
    setPendingStart(null);
    setOpen(false);
  };

  const clear = () => {
    onFromChange?.('');
    onToChange?.('');
    setPendingStart(null);
  };

  const classFor = (day, t) => {
    const inMonth = day.getMonth() === view.getMonth();
    const isFrom = lo ? sameDay(day, lo) : false;
    const isTo = hi ? sameDay(day, hi) : false;
    const inRange = Boolean(lo && hi) && day > lo && day < hi;
    return [
      !inMonth ? 'is-outside' : '',
      sameDay(day, t) ? 'is-today' : '',
      inRange ? 'in-range' : '',
      isFrom || isTo ? 'is-edge' : '',
    ].filter(Boolean).join(' ');
  };

  // While a range is being picked, one bound is set, so show a single date rather
  // than a one-day range.
  const label = from && to ? formatRange(from, to) : from ? formatDay(from) : to ? formatDay(to) : placeholder;

  return (
    <div className="filter-pill date-picker" ref={ref}>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className={`filter-pill-btn ${isActive ? 'is-active' : ''}`}
        aria-label={`${fromLabel} to ${toLabel}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setPendingStart(null);
          setOpen((v) => !v);
        }}
      >
        <Icon name="calendar" size={14} />
        <span className="filter-pill-label">{label}</span>
        <Icon name="chevron-down" size={14} className="filter-pill-chevron" />
      </button>

      {open && (
        <div
          ref={popRef}
          className="date-picker-pop"
          role="dialog"
          aria-label={`${fromLabel} to ${toLabel}`}
          style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
        >
          <CalendarGrid view={view} onShiftMonth={shiftMonth} classFor={classFor} onDayClick={handleDayClick} />

          <div className="date-picker-foot">
            <span className="date-picker-hint">
              {pendingStart ? 'Now pick the end date' : from && to ? formatRange(from, to) : 'Pick a start date'}
            </span>
            {(from || to) && (
              <button type="button" className="date-picker-clear" onClick={clear}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}