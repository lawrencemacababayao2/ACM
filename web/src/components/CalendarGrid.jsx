import React, { useMemo } from 'react';
import Icon from './Icon.jsx';
import { WEEKDAYS, buildGrid, toISO } from '../lib/dateUtils.js';

/**
 * Month header, weekday row and six-week day grid shared by every calendar in the
 * app. Day appearance is delegated to classFor so each picker can highlight
 * differently (range edges vs a single selected day) without duplicating the
 * grid itself.
 */
export default function CalendarGrid({ view, onShiftMonth, classFor, onDayClick, isDayDisabled, disableNext = false, yearOptions = [], onJumpYear }) {
  const grid = useMemo(() => buildGrid(view), [view]);
  const today = new Date();

  const hasYearJump = yearOptions.length > 0 && typeof onJumpYear === 'function';

  return (
    <>
      <div className="date-picker-head">
        <button type="button" className="date-picker-nav" aria-label="Previous month" onClick={() => onShiftMonth(-1)}>
          <Icon name="chevron-left" size={16} />
        </button>
        <div className="date-picker-title">
          {/* With a year list the title opens on the month and the year is its own
              control, so a birthday form can jump straight to a distant year
              instead of paging the chevrons one month at a time. */}
          {hasYearJump ? (
            <span className="date-picker-title-row">
              {view.toLocaleDateString('en-US', { month: 'long' })}
              <select
                className="date-picker-year"
                aria-label="Year"
                value={view.getFullYear()}
                onChange={(e) => onJumpYear(Number(e.target.value))}
              >
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </span>
          ) : (
            view.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
          )}
        </div>
        <button type="button" className="date-picker-nav" aria-label="Next month" disabled={disableNext} onClick={() => onShiftMonth(1)}>
          <Icon name="chevron-right" size={16} />
        </button>
      </div>

      <div className="date-picker-body">
        <div className="date-picker-week">
          {WEEKDAYS.map((w) => (
            <span key={w} className="date-picker-wd">{w}</span>
          ))}
        </div>

        <div className="date-picker-grid">
          {grid.map((day) => (
            <button
              key={toISO(day)}
              type="button"
              className={`date-picker-day ${classFor(day, today, view)}`}
              aria-label={day.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              disabled={isDayDisabled ? isDayDisabled(day) : undefined}
              onClick={() => onDayClick(day)}
            >
              {day.getDate()}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}