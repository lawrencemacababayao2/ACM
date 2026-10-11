import React, { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import CalendarGrid from './CalendarGrid.jsx';
import { useDismissOnOutside, usePopoverPlacement } from './usePopover.js';
import { formatDay, monthStart, parseISO, sameDay, toISO } from '../lib/dateUtils.js';

/**
 * Where the grid opens. With an upper bound the newest reachable month is the
 * boundary month itself, so open there rather than on today, where every day
 * would be struck out and the field would look broken.
 */
function initialView(value, max) {
  if (value) return monthStart(parseISO(value));
  return monthStart(max ? parseISO(max) : new Date());
}

/**
 * Single-date calendar used by form fields. Same visual language as the range
 * picker, but with no start/end bookkeeping: one click commits and dismisses,
 * matching how the filter pills behave. Emits a plain 'YYYY-MM-DD' string.
 */
export default function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  ariaLabel = 'Date',
  min,
  max,
  id,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => initialView(value, max));
  const ref = useRef(null);
  const triggerRef = useRef(null);
  const popRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);
  useDismissOnOutside(open, ref, close);
  const pos = usePopoverPlacement(open, triggerRef, popRef);

  // Follow the value when it changes from outside, e.g. opening Edit on a record.
  useEffect(() => {
    if (value) setView(monthStart(parseISO(value)));
  }, [value]);

  // A field that becomes disabled while its calendar is open has to close, or the
  // popover would outlive the control that is now unclickable.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  // Optional window. Days outside it are marked and not clickable. When there is
  // a ceiling, months past it are also unreachable rather than shown fully struck
  // out, so an age rule like "18 and up" never presents a wall of dead numbers.
  const minDate = min ? parseISO(min) : null;
  const maxDate = max ? parseISO(max) : null;
  const isDayDisabled = (day) =>
    Boolean((minDate && day < minDate) || (maxDate && day > maxDate));

  // A year dropdown in the header, so a birthday - which is often decades in the
  // past - can be reached in one selection instead of dozens of month chevrons.
  // Spans the allowed window; without a min it starts at 1900.
  const yearEnd = maxDate ? maxDate.getFullYear() : new Date().getFullYear();
  const yearStart = minDate ? minDate.getFullYear() : 1900;
  const yearOptions = [];
  for (let y = yearEnd; y >= yearStart; y--) yearOptions.push(y);

  const jumpYear = (year) => {
    setView((v) => new Date(Math.max(yearStart, Math.min(yearEnd, year)), v.getMonth(), 1));
  };

  const atCeiling = Boolean(maxDate) && (
    view.getFullYear() > maxDate.getFullYear()
    || (view.getFullYear() === maxDate.getFullYear() && view.getMonth() >= maxDate.getMonth())
  );

  const shiftMonth = (delta) => {
    if (delta > 0 && atCeiling) return;
    setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));
  };

  const pick = (day) => {
    if (isDayDisabled(day)) return;
    onChange?.(toISO(day));
    setOpen(false);
  };

  const classFor = (day, today, v) => {
    const inMonth = day.getMonth() === v.getMonth();
    const selected = value ? sameDay(day, parseISO(value)) : false;
    return [
      !inMonth ? 'is-outside' : '',
      sameDay(day, today) ? 'is-today' : '',
      selected ? 'is-edge' : '',
      isDayDisabled(day) ? 'is-disabled' : '',
    ].filter(Boolean).join(' ');
  };

  // Shown in the footer whenever a window is set, so the greyed-out days read as
  // intentional rather than broken.
  const rangeHint =
    min && max
      ? `${formatDay(min)} – ${formatDay(max)}`
      : min
        ? `From ${formatDay(min)}`
        : max
          ? `Up to ${formatDay(max)}`
          : null;

  return (
    <div className={`filter-pill date-picker${disabled ? ' is-disabled' : ''}`} ref={ref}>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className="filter-pill-btn is-field"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen((v) => !v); }}
      >
        <Icon name="calendar" size={15} />
        <span className={`filter-pill-label ${value ? '' : 'is-placeholder'}`}>
          {value ? formatDay(value) : placeholder}
        </span>
        <Icon name="chevron-down" size={14} className="filter-pill-chevron" />
      </button>

      {open && (
        <div
          ref={popRef}
          className="date-picker-pop"
          role="dialog"
          aria-label={ariaLabel}
          style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
        >
          <CalendarGrid
            view={view}
            onShiftMonth={shiftMonth}
            classFor={classFor}
            onDayClick={pick}
            isDayDisabled={isDayDisabled}
            disableNext={atCeiling}
            yearOptions={yearOptions}
            onJumpYear={jumpYear}
          />

          <div className="date-picker-foot">
            <span className="date-picker-hint">
              {min || max ? rangeHint : value ? formatDay(value) : 'Pick a date'}
            </span>
            <span className="date-picker-foot-actions">
              {!isDayDisabled(new Date()) && (
                <button
                  type="button"
                  className="date-picker-today"
                  onClick={() => pick(new Date())}
                >
                  Today
                </button>
              )}
              {value && (
                <button
                  type="button"
                  className="date-picker-clear"
                  onClick={() => {
                    onChange?.('');
                    setOpen(false);
                  }}
                >
                  Clear
                </button>
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}