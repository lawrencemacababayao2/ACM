import React, { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import CalendarGrid from './CalendarGrid.jsx';
import TimeWheel, { formatWheelTime } from './TimeWheel.jsx';
import { useDismissOnOutside, usePopoverPlacement } from './usePopover.js';
import {
  formatDay,
  joinDateTime,
  monthStart,
  parseISO,
  sameDay,
  splitDateTime,
  toISO,
} from '../lib/dateUtils.js';

// Native datetime-local opens at the current time; 09:00 is the least surprising
// default for office hours and is visible in the columns so it can be changed.
const DEFAULT_TIME = '09:00';

/**
 * Combined date + time control for the Programs schedule field. Emits the exact
 * 'YYYY-MM-DDTHH:MM' string that <input type="datetime-local"> produced, so
 * toLocalInput(), the edit form and the submit payload all keep working.
 *
 * The two parts are edited in one popover because the schedule is a single
 * column in the form; a separate Time control next to it would need a partial
 * value to be submitted on its own.
 */
export default function DateTimePicker({
  value,
  onChange,
  placeholder = 'Select date & time',
  ariaLabel = 'Schedule',
  id,
  min,
  max,
}) {
  const [open, setOpen] = useState(false);
  const initial = splitDateTime(value);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time || DEFAULT_TIME);
  const [view, setView] = useState(() => monthStart(initial.date ? parseISO(initial.date) : new Date()));
  const ref = useRef(null);
  const triggerRef = useRef(null);
  const popRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);
  useDismissOnOutside(open, ref, close);
  const pos = usePopoverPlacement(open, triggerRef, popRef);

  // Re-sync when the record changes underneath us, e.g. Edit on another row.
  useEffect(() => {
    const p = splitDateTime(value);
    setDate(p.date);
    if (p.time) setTime(p.time);
  }, [value]);

  const commit = (nextDate, nextTime) => {
    setDate(nextDate);
    setTime(nextTime);
    onChange?.(joinDateTime(nextDate, nextTime));
  };

  const shiftMonth = (delta) => setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));

  const isDateDisabled = (day) => {
    if (min) {
      const minDate = min.split('T')[0];
      if (day < parseISO(minDate)) return true;
    }
    if (max) {
      const maxDate = max.split('T')[0];
      if (day > parseISO(maxDate)) return true;
    }
    return false;
  };

  const isTimeDisabled = (t) => {
    if (!date) return false;
    if (min && date === min.split('T')[0]) {
      const minTime = min.split('T')[1];
      if (t < minTime) return true;
    }
    if (max && date === max.split('T')[0]) {
      const maxTime = max.split('T')[1];
      if (t > maxTime) return true;
    }
    return false;
  };

  const pickDay = (day) => {
    if (isDateDisabled(day)) return;
    // Keep the popover open so the time can be set without reopening.
    setView(monthStart(day));
    commit(toISO(day), time || DEFAULT_TIME);
  };

  const clear = () => {
    setDate('');
    onChange?.('');
    setOpen(false);
  };

  const classFor = (day, today, v) => {
    const inMonth = day.getMonth() === v.getMonth();
    const selected = date ? sameDay(day, parseISO(date)) : false;
    const disabled = isDateDisabled(day);
    return [
      !inMonth ? 'is-outside' : '',
      sameDay(day, today) ? 'is-today' : '',
      selected ? 'is-edge' : '',
      disabled ? 'is-disabled' : '',
    ].filter(Boolean).join(' ');
  };

  const timeLabel = formatWheelTime(time) || formatWheelTime(DEFAULT_TIME);
  const label = date ? `${formatDay(date)} · ${timeLabel}` : placeholder;

  return (
    <div className="filter-pill date-picker" ref={ref}>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className="filter-pill-btn is-field"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="calendar" size={15} />
        <span className={`filter-pill-label ${date ? '' : 'is-placeholder'}`}>{label}</span>
        <Icon name="chevron-down" size={14} className="filter-pill-chevron" />
      </button>

      {open && (
        <div
          ref={popRef}
          className="date-picker-pop is-split"
          role="dialog"
          aria-label={ariaLabel}
          style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
        >
          <div className="date-picker-calendar">
            <CalendarGrid view={view} onShiftMonth={shiftMonth} classFor={classFor} onDayClick={pickDay} />
          </div>

          <TimeWheel value={time} onChange={(t) => isTimeDisabled(t) ? null : commit(date, t || DEFAULT_TIME)} label="Time" disabledTimes={min ? min.split('T')[1] : null} maxTime={max ? max.split('T')[1] : null} currentDate={date} />

          <div className="date-picker-foot">
            <span className="date-picker-hint">
              {date ? `${formatDay(date)} · ${timeLabel}` : 'Pick a date'}
            </span>
            <span className="date-picker-foot-actions">
              <button
                type="button"
                className="date-picker-today"
                onClick={() => {
                  const now = new Date();
                  setView(monthStart(now));
                  commit(toISO(now), time || DEFAULT_TIME);
                }}
              >
                Today
              </button>
              {date && (
                <button type="button" className="date-picker-clear" onClick={clear}>
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