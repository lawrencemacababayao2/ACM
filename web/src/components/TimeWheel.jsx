import React from 'react';
import { formatTime12, pad, parseTime24 } from '../lib/dateUtils.js';

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

/**
 * The hour / minute / AM-PM half of a time control, with no popover and no date.
 *
 * This was lifted out of DateTimePicker so the trainings form could pick a time
 * *range* in the same visual language instead of asking someone to type
 * "8:00 AM - 5:00 PM" into a text box. Two callers now share one implementation,
 * which is why the wheel takes a plain value + onChange rather than owning state:
 * DateTimePicker keeps its date alongside it, TimeRangePicker points it at one end
 * of a range.
 *
 * `value` is 'HH:MM' on a 24-hour clock. `label` names the column set for screen
 * readers; a range picker passes something like "Start time".
 */
export default function TimeWheel({ value, onChange, label = 'Time', id, disabledTimes = null, maxTime = null, currentDate = null, min = null, max = null }) {
  const parts = parseTime24(value) || { h: 9, m: 0 };
  const isPm = parts.h >= 12;

  const isTimeDisabled = (h24, m24) => {
    // Check against min time
    if (min && currentDate === min.split('T')[0]) {
      const minTime = min.split('T')[1];
      const [minH, minM] = minTime.split(':').map(Number);
      if (h24 < minH || (h24 === minH && m24 < minM)) return true;
    }
    // Check against max time
    if (max && currentDate === max.split('T')[0]) {
      const maxTime = max.split('T')[1];
      const [maxH, maxM] = maxTime.split(':').map(Number);
      if (h24 > maxH || (h24 === maxH && m24 > maxM)) return true;
    }
    return false;
  };

  const isHourDisabled = (h24) => {
    // Check if any minute in this hour is enabled
    for (const m of MINUTES) {
      if (!isTimeDisabled(h24, m)) return false;
    }
    return true;
  };

  const isMinuteDisabled = (h24, m) => isTimeDisabled(h24, m);

  const emit = (h24, m24) => {
    if (isTimeDisabled(h24, m24)) return;
    onChange?.(`${pad(h24)}:${pad(m24)}`);
  };

  return (
    <div className="time-picker">
      <div className="time-picker-head">
        <span className="time-picker-title">{label}</span>
        <div className="time-picker-seg" role="group" aria-label="AM or PM">
          <button type="button" className={!isPm ? 'is-on' : ''} aria-pressed={!isPm} onClick={() => emit(parts.h % 12, parts.m)}>
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
              return (
                <button
                  key={h}
                  type="button"
                  className={`time-picker-item${on ? ' is-on' : ''}${disabled ? ' is-disabled' : ''}`}
                  aria-pressed={on}
                  aria-disabled={disabled}
                  aria-label={`${h} ${isPm ? 'PM' : 'AM'}`}
                  onClick={() => emit(h24, parts.m)}
                  disabled={disabled}
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
              return (
                <button
                  key={m}
                  type="button"
                  className={`time-picker-item${on ? ' is-on' : ''}${disabled ? ' is-disabled' : ''}${m % 15 !== 0 ? ' is-sub' : ''}`}
                  aria-pressed={on}
                  aria-disabled={disabled}
                  aria-label={`${m} minutes past the hour`}
                  onClick={() => emit(parts.h, m)}
                  disabled={disabled}
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