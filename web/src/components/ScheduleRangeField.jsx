import React from 'react';
import Field from './Field.jsx';
import DatePicker from './DatePicker.jsx';
import TimeRangePicker from './TimeRangePicker.jsx';

// The Programs and Training & Seminars forms both edit a schedule as a date
// range plus a time range. The parts live in `value` as date_from, date_to,
// time_from and time_to; the parent flattens/rebuilds them on save.
//
// The four parts use the app's own popover pickers (the calendar and the time
// wheel) rather than native date/time inputs, so the whole schedule reads like
// the other branded fields. The end date clamps to the start so a backwards
// range cannot be entered; the time range picker keeps its two ends in order.
export default function ScheduleRangeField({ value, onChange, error }) {
  const set = (patch) => onChange({ ...value, ...patch });

  return (
    <div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600, marginBottom: 5 }}>Schedule</div>
      <div className="form-grid">
        <Field label="Start date" error={Boolean(error)}>
          <DatePicker
            value={value.date_from || ''}
            onChange={(v) => set({ date_from: v })}
            placeholder="Pick a date"
            ariaLabel="Start date"
          />
        </Field>
        <Field label="End date" hint="Defaults to the start date when left blank.">
          <DatePicker
            value={value.date_to || ''}
            onChange={(v) => set({ date_to: v })}
            min={value.date_from || undefined}
            placeholder="Pick a date"
            ariaLabel="End date"
          />
        </Field>
        <Field label="Time range" col2 error={Boolean(error)}>
          <TimeRangePicker
            start={value.time_from || ''}
            end={value.time_to || ''}
            onChange={({ start, end }) => set({ time_from: start || '', time_to: end || '' })}
            ariaLabel="Time range"
          />
        </Field>
      </div>
      {error && <span className="error" style={{ display: 'block', marginTop: 4 }}>{error}</span>}
    </div>
  );
}