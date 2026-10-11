import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';
import TimeWheel, { formatWheelTime } from './TimeWheel.jsx';
import { useDismissOnOutside, usePopoverPlacement } from './usePopover.js';

/**
 * Start/end time range for the trainings & seminars form.
 *
 * Replaces a free-text field that used to hold whatever someone typed, e.g.
 * "8:00 AM - 5:00 PM", "8am-5pm", or "morning". Only two shapes are storable now
 * (two TIME columns) and the API rejects a start without an end or an end before
 * the start, so the control has to make both ends explicit.
 *
 * One trigger shows the whole range rather than two separate fields, because the
 * value is conceptually one schedule: splitting it across two inputs in a form
 * row that already holds Date and End time left no room without wrapping. The popover
 * edits whichever end is selected, and switching between them keeps the time that
 * was already chosen for the other.
 *
 * Values are 'HH:MM' 24-hour strings, matching what the API stores.
 *
 * The popover is portalled to <body>, like FilterPill's menu. Two reasons, both
 * of which were bugs before it moved: anchored inside the form it was clipped by
 * the scrolling .modal-body, and it sat inside the <label> that Field renders,
 * whose activation behaviour forwards a click on non-interactive content -- the
 * popover's own padding, the "Hour" and "Minute" captions, the footer hint -- to
 * the first labelable descendant, which is the trigger. That reopened the
 * trigger's onClick and closed the picker mid-interaction.
 */
export default function TimeRangePicker({ start, end, onChange, ariaLabel = 'Time range', id }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('start');
  const ref = useRef(null);
  const triggerRef = useRef(null);
  const popRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);
  useDismissOnOutside(open, ref, close, popRef);
  const pos = usePopoverPlacement(open, triggerRef, popRef);

  const setEnd = (nextStart, nextEnd) => {
    onChange?.({ start: nextStart, end: nextEnd });
  };

  // Editing the start of a range whose end already sits earlier would silently
  // create an invalid one, so the old end is dropped rather than kept. The user
  // then sets the end again and sees the new value in the footer.
  const setStart = (nextStart) => {
    const startParts = nextStart.split(':').map(Number);
    const endParts = (end || '').split(':').map(Number);
    const endIsEarlier = end
      && (endParts[0] < startParts[0] || (endParts[0] === startParts[0] && endParts[1] <= startParts[1]));
    setEnd(nextStart, endIsEarlier ? '' : end);
  };

  const setStop = (nextEnd) => {
    const startParts = (start || '').split(':').map(Number);
    const endParts = nextEnd.split(':').map(Number);
    // Refuse to store an end at or before the start: the server rejects it anyway,
    // and silently dropping the keystroke would look like the picker is broken.
    if (!start) return;
    if (endParts[0] < startParts[0] || (endParts[0] === startParts[0] && endParts[1] <= startParts[1])) return;
    setEnd(start, nextEnd);
  };

  const active = target === 'start' ? start : end;
  const onActiveChange = target === 'start' ? setStart : setStop;

  // A record can change underneath the form, e.g. Edit on another row.
  useEffect(() => { if (!open) setTarget('start'); }, [open]);

  const from = formatWheelTime(start);
  const to = formatWheelTime(end);
  const label = from && to ? `${from} – ${to}` : from || to || 'Select time range';
  const incomplete = Boolean(from) !== Boolean(to);

  return (
    <div className="filter-pill time-range-picker" ref={ref}>
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
        <span className={`filter-pill-label ${from ? '' : 'is-placeholder'}`}>{label}</span>
        <Icon name="chevron-down" size={14} className="filter-pill-chevron" />
      </button>

      {open && createPortal(
        <div
          ref={popRef}
          className="date-picker-pop is-time"
          role="dialog"
          aria-label={ariaLabel}
          style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
        >
          <div className="time-range-seg" role="group" aria-label="Which end of the range">
            <button type="button" className={target === 'start' ? 'is-on' : ''} aria-pressed={target === 'start'} onClick={() => setTarget('start')}>
              Start{from ? ` · ${from}` : ''}
            </button>
            <button type="button" className={target === 'end' ? 'is-on' : ''} aria-pressed={target === 'end'} onClick={() => setTarget('end')}>
              End{to ? ` · ${to}` : ''}
            </button>
          </div>

          <TimeWheel value={active} onChange={onActiveChange} label={target === 'start' ? 'Start time' : 'End time'} />

          <div className="date-picker-foot">
            <span className="date-picker-hint">
              {incomplete ? 'Set both a start and an end' : label}
            </span>
            <span className="date-picker-foot-actions">
              <button
                type="button"
                className="date-picker-clear"
                onClick={() => { setEnd('', ''); setOpen(false); }}
              >
                Clear
              </button>
            </span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}