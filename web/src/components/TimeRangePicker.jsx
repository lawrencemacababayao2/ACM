import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';
import TimeWheel, { formatWheelTime } from './TimeWheel.jsx';
import { useDismissOnOutside, usePopoverPlacement } from './usePopover.js';
import { formatTime12, parseTime24 } from '../lib/dateUtils.js';

function parseHm(v) {
  const p = parseTime24(v);
  if (!p) return null;
  return { h: p.h, m: p.m, min: p.h * 60 + p.m };
}

/**
 * Start/end time range for the trainings & seminars form.
 */
export default function TimeRangePicker({ start, end, onChange, ariaLabel = 'Time range', id, dateFrom = '', dateTo = '' }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('start');
  const ref = useRef(null);
  const triggerRef = useRef(null);
  const popRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);
  useDismissOnOutside(open, ref, close, popRef);
  const pos = usePopoverPlacement(open, triggerRef, popRef);

  const endDateEff = dateTo || dateFrom;
  const endLaterDay = Boolean(dateFrom && endDateEff && endDateEff > dateFrom);

  const startP = parseHm(start);
  const endP = parseHm(end);

  const requiredInvalid = Boolean(startP && endP && !endLaterDay && endP.min <= startP.min);
  const invalid = requiredInvalid;

  const setEnd = (nextStart, nextEnd) => {
    onChange?.({ start: nextStart, end: nextEnd });
  };

  const setStart = (nextStart) => {
    const sp = parseHm(nextStart);
    const ep = parseHm(end);
    const wouldInvalidate = sp && ep && !endLaterDay && ep.min <= sp.min;
    setEnd(nextStart, wouldInvalidate ? '' : end);
  };

  const setStop = (nextEnd) => {
    if (!start) return;
    const sp = parseHm(start);
    const ep = parseHm(nextEnd);
    if (!sp || !ep) return;
    if (!endLaterDay && ep.min <= sp.min) return;
    setEnd(start, nextEnd);
  };

  const active = target === 'start' ? start : end;
  const onActiveChange = target === 'start' ? setStart : setStop;

  useEffect(() => { if (!open) setTarget('start'); }, [open]);

  const from = formatWheelTime(start);
  const to = formatWheelTime(end);
  const label = from && to ? `${from} – ${to}` : from || to || 'Select time range';
  const incomplete = Boolean(from) !== Boolean(to);

  const [helperState, setHelperState] = useState({ msg: '', error: false, shake: false, hasDisabled: false, startLabel: '' });
  const [suggest, setSuggest] = useState(null);
  const helperTimer = useRef(null);
  const pulsed = useRef(false);
  const endAutoDefaulted = useRef(false);

  const triggerFlash = useCallback((isErr) => {
    setHelperState((s) => ({ ...s, error: !!isErr, shake: !!isErr }));
    if (helperTimer.current) clearTimeout(helperTimer.current);
    if (isErr) {
      helperTimer.current = setTimeout(() => setHelperState((s) => ({ ...s, shake: false })), 600);
      helperTimer.current = setTimeout(() => setHelperState((s) => ({ ...s, error: false })), 600);
    }
  }, []);

  const formatStart = () => {
    if (!startP) return '';
    return formatTime12(startP.h, startP.m);
  };

  // auto-switch to PM if whole AM disabled
  useEffect(() => {
    if (!open || target !== 'end' || !startP || endLaterDay) return;
    let anyAmValid = false;
    for (let h12 = 1; h12 <= 12; h12++) {
      const h24 = h12 % 12;
      if (h24 * 60 + 0 > startP.min) { anyAmValid = true; break; }
    }
    if (!anyAmValid) {
      for (let h12 = 1; h12 <= 12; h12++) {
        const h24 = h12 % 12 + 12;
        for (let mi = 0; mi < 60; mi += 5) {
          if (h24 * 60 + mi > startP.min) {
            setEnd(start, `${String(h24).padStart(2,'0')}:${String(mi).padStart(2,'0')}`);
            break;
          }
        }
        break;
      }
    }
  }, [open, target, startP, endLaterDay, start]); // eslint-disable-line

  // smart default
  useEffect(() => {
    if (open && target === 'end' && startP && !endLaterDay && !endP && !endAutoDefaulted.current) {
      for (let h24 = 0; h24 < 24; h24++) {
        for (let mi = 0; mi < 60; mi += 5) {
          if (h24 * 60 + mi > startP.min) {
            setEnd(start, `${String(h24).padStart(2,'0')}:${String(mi).padStart(2,'0')}`);
            endAutoDefaulted.current = true;
            return;
          }
        }
      }
      endAutoDefaulted.current = true;
    }
    if (!open) { endAutoDefaulted.current = false; }
  }, [open, target, startP, endLaterDay, endP, start]); // eslint-disable-line

  useEffect(() => {
    if (!open) {
      pulsed.current = false;
      setSuggest(null);
      setHelperState({ msg: '', error: false, shake: false, hasDisabled: false, startLabel: '' });
    }
  }, [open]);

  const handleDisabledClick = useCallback((h24) => {
    if (target !== 'end' || !startP || endLaterDay) return;
    const clickedIsPm = h24 >= 12;
    const otherH24 = clickedIsPm ? (h24 % 12) : h24 + 12;
    let validInOther = false;
    for (let mi = 0; mi < 60; mi += 5) {
      if (otherH24 * 60 + mi > startP.min) { validInOther = true; break; }
    }
    if (validInOther && !pulsed.current) {
      pulsed.current = true;
      setSuggest({ h12: otherH24 % 12 === 0 ? 12 : otherH24 % 12, ampm: otherH24 >= 12 ? 'PM' : 'AM', h24: otherH24 });
    }
    triggerFlash(true);
    setTimeout(() => triggerFlash(false), 600);
  }, [target, startP, endLaterDay, triggerFlash]);

  const applySuggest = () => {
    if (!suggest || !startP) return;
    for (let mi = 0; mi < 60; mi += 5) {
      if (suggest.h24 * 60 + mi > startP.min) {
        setEnd(start, `${String(suggest.h24).padStart(2,'0')}:${String(mi).padStart(2,'0')}`);
        setTarget('end');
        setSuggest(null);
        pulsed.current = false;
        break;
      }
    }
  };

  const showPanel = target === 'end' && startP && !endLaterDay && (helperState.hasDisabled || helperState.error);
  const panelMsg = helperState.error ? `End time must be later than ${helperState.startLabel || formatStart()}.` : `Pick an end time later than ${helperState.startLabel || formatStart()}.`;

  return (
    <div className="filter-pill time-range-picker" ref={ref}>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className={`filter-pill-btn is-field${invalid ? ' is-invalid' : ''}`}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="clock" size={15} />
        <span className={`filter-pill-label ${from ? '' : 'is-placeholder'}${invalid ? ' is-invalid-text' : ''}`}>
          {invalid ? 'End time must be later than the start time.' : label}
        </span>
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
            <button type="button" className={target === 'start' ? 'is-on' : ''} aria-pressed={target === 'start'} onClick={() => { setTarget('start'); setSuggest(null); }}>
              Start{from ? ` · ${from}` : ''}
            </button>
            <button type="button" className={target === 'end' ? 'is-on' : ''} aria-pressed={target === 'end'} onClick={() => { setTarget('end'); }}>
              End{to ? ` · ${to}` : ''}
            </button>
          </div>

          {showPanel && (
            <div className={`time-range-helper${helperState.error ? ' is-error' : ' is-hint'}${helperState.shake ? ' is-shake' : ''}`}>
              <Icon name="info" size={14} />
              <span>
                {panelMsg}
              </span>
            </div>
          )}

          <TimeWheel
            value={active}
            onChange={onActiveChange}
            label={target === 'start' ? 'Start time' : 'End time'}
            isEnd={target === 'end'}
            rangeStartTime={start || ''}
            rangeStartDate={dateFrom || ''}
            rangeEndDate={endDateEff || dateFrom || ''}
            onDisabledClick={handleDisabledClick}
            onValidityChange={(v) => setHelperState((s) => ({ ...s, hasDisabled: v.hasDisabled, startLabel: v.startLabel }))}
          />

          <div className="date-picker-foot">
            <span className={`date-picker-hint${requiredInvalid ? ' is-invalid-text' : ''}`}>
              {requiredInvalid ? 'End time must be later than the start time.' : (incomplete ? 'Set both a start and an end' : label)}
            </span>
            <span className="date-picker-foot-actions">
              <button
                type="button"
                className="date-picker-clear"
                onClick={() => { setEnd('', ''); setOpen(false); setSuggest(null); setHelperState({ msg: '', error: false, shake: false, hasDisabled: false, startLabel: '' }); }}
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
