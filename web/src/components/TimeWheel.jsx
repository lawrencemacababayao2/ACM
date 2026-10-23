import React from 'react';
import { formatTime12, pad, parseTime24 } from '../lib/dateUtils.js';

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function to24(h12, isPm) {
  if (h12 === 12) return isPm ? 12 : 0;
  return isPm ? h12 + 12 : h12;
}

function parseHm24(v) {
  const p = parseTime24(v);
  if (!p) return null;
  return { h: p.h, m: p.m, total: p.h * 60 + p.m };
}

/**
 * The hour / minute / AM-PM half of a time control, with no popover and no date.
 */
export default function TimeWheel({
  value,
  onChange,
  label = 'Time',
  id,
  rangeStartTime = null,
  rangeStartDate = null,
  rangeEndDate = null,
  isEnd = false,
  onDisabledClick,
  onValidityChange,
}) {
  const parts = parseTime24(value) || { h: 9, m: 0 };
  const isPm = parts.h >= 12;

  const toMinutes = (h24, m24) => h24 * 60 + m24;

  const isEndDateAfterStart = () => {
    if (!isEnd || !rangeStartDate || !rangeEndDate) return false;
    return rangeEndDate > rangeStartDate;
  };

  const isOptionDisabled = ({ h24, m24 }) => {
    if (!isEnd || !rangeStartTime) return false;
    if (isEndDateAfterStart()) return false;
    const start = parseHm24(rangeStartTime);
    if (!start) return false;
    // disabled only if NOT later than start time (so equal is disabled)
    return toMinutes(h24, m24) <= start.total;
  };

  const isHourDisabled = (h24) => {
    if (!isEnd || !rangeStartTime) return false;
    if (isEndDateAfterStart()) return false;
    const start = parseHm24(rangeStartTime);
    if (!start) return false;
    // hour disabled only if no minute in that hour would be valid (even :55 not later)
    for (const m of MINUTES) {
      if (toMinutes(h24, m) > start.total) return false;
    }
    return true;
  };

  const isMinuteDisabled = (h24, m24) => {
    if (!isEnd || !rangeStartTime) return false;
    if (isEndDateAfterStart()) return false;
    const start = parseHm24(rangeStartTime);
    if (!start) return false;
    // minute disabled only when same hour and AM/PM as start, and minute <= start minute
    if (h24 === start.h) {
      return m24 <= start.m;
    }
    return toMinutes(h24, m24) <= start.total;
  };

  const emit = (h24, m24) => {
    if (isOptionDisabled({ h24, m24 })) {
      if (onDisabledClick) onDisabledClick(h24, m24);
      return;
    }
    onChange?.(`${pad(h24)}:${pad(m24)}`);
  };

  // notify parent about validity
  React.useEffect(() => {
    if (!onValidityChange) return;
    const start = parseHm24(rangeStartTime);
    if (!isEnd || !start || isEndDateAfterStart()) {
      onValidityChange({ hasDisabled: false, currentInvalid: false, startLabel: start ? formatTime12(start.h, start.m) : '' });
      return;
    }
    let hasDisabled = false;
    for (let h12 = 1; h12 <= 12; h12++) {
      const h24 = h12 % 12 + (isPm ? 12 : 0);
      if (isHourDisabled(h24)) { hasDisabled = true; break; }
    }
    if (!hasDisabled) {
      for (let h12 = 1; h12 <= 12; h12++) {
        const h24 = h12 % 12 + (isPm ? 12 : 0);
        for (const m of MINUTES) {
          if (isMinuteDisabled(h24, m)) { hasDisabled = true; break; }
        }
        if (hasDisabled) break;
      }
    }
    const currentInvalid = parts.h * 60 + parts.m <= start.total;
    onValidityChange({ hasDisabled, currentInvalid, startLabel: formatTime12(start.h, start.m) });
  }, [value, isEnd, rangeStartTime, rangeStartDate, rangeEndDate, isPm]); // eslint-disable-line

  // check if all hours disabled in current AM/PM
  const allHoursDisabledInCurrentPeriod = () => {
    if (!isEnd || !rangeStartTime || isEndDateAfterStart()) return false;
    for (const h of HOURS) {
      const h12 = h === 12 ? 0 : h;
      const h24 = h % 12 + (isPm ? 12 : 0);
      if (!isHourDisabled(h24)) return false;
    }
    return true;
  };

  const start = parseHm24(rangeStartTime);
  const startLabel = start ? formatTime12(start.h, start.m) : '';
  const allDisabled = allHoursDisabledInCurrentPeriod();

  return (
    <div className="time-picker">
      <div className="time-picker-head">
        <span className="time-picker-title">{label}</span>
        <div className="time-picker-seg" role="group" aria-label="AM or PM">
          <button
            type="button"
            className={!isPm ? 'is-on' : ''}
            aria-pressed={!isPm}
            disabled={allDisabled && !isPm}
            title={allDisabled && !isPm ? `No valid AM times after the start.` : undefined}
            onClick={() => { if (allDisabled && !isPm) return; emit(parts.h % 12, parts.m); }}
          >
            AM
          </button>
          <button type="button" className={isPm ? 'is-on' : ''} aria-pressed={isPm} onClick={() => emit((parts.h % 12) + 12, parts.m)}>
            PM
          </button>
        </div>
      </div>

      <div className="time-picker-cols">
        <div className="time-picker-col">
          <span className="time-picker-cap">Hour</span>
          <div className="time-picker-list" id={id}>
            {HOURS.map((h) => {
              const h12 = h === 12 ? 0 : h;
              const h24 = h % 12 + (isPm ? 12 : 0);
              const on = h12 === parts.h % 12;
              const disabled = isHourDisabled(h24);
              const tip = disabled ? `Must be after ${startLabel}` : undefined;
              return (
                <button
                  key={h}
                  type="button"
                  className={`time-picker-item${on ? ' is-on' : ''}${disabled ? ' is-disabled' : ''}`}
                  aria-pressed={on}
                  aria-disabled={disabled}
                  aria-label={`${h} ${isPm ? 'PM' : 'AM'}`}
                  title={tip}
                  onClick={() => emit(h24, parts.m)}
                >
                  {h}
                </button>
              );
            })}
          </div>
        </div>

        <div className="time-picker-col">
          <span className="time-picker-cap">Minute</span>
          <div className="time-picker-list">
            {MINUTES.map((m) => {
              const on = m === parts.m;
              const disabled = isMinuteDisabled(parts.h, m);
              const tip = disabled ? `Must be after ${startLabel}` : undefined;
              return (
                <button
                  key={m}
                  type="button"
                  className={`time-picker-item${on ? ' is-on' : ''}${disabled ? ' is-disabled' : ''}`}
                  aria-pressed={on}
                  aria-disabled={disabled}
                  aria-label={`${m} minutes past the hour`}
                  title={tip}
                  onClick={() => emit(parts.h, m)}
                >
                  {pad(m)}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 'HH:MM' -> '8:00 AM'. Returns '' for a missing or malformed value. */
export function formatWheelTime(value) {
  const p = parseTime24(value);
  return p ? formatTime12(p.h, p.m) : '';
}