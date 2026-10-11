import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';
import {
  ALL,
  BEN_TYPES,
  FORM_TARGET_OPTIONS,
  normalizeTypes,
  toggleTypes,
  removeType,
} from '../lib/targetTypes.js';

// Checkbox multi-select for the target beneficiary type.
//
// The menu stays open while picking (unlike FilterPill, which closes on select),
// because a multi-select that vanishes after one tick is unusable. The closed
// state shows the selection as removable chips so the current audience is visible
// without opening anything.
//
// 'All' is mutually exclusive with the specific registered types: it means "every
// verified beneficiary", so ticking it clears the registered half and ticking a
// registered type clears it. The same is true of 'public' -- both are audiences
// in their own right rather than rival groups that could be combined.
//
// The last remaining chip cannot be removed, because a post with no audience
// reaches nobody and is never intended -- the API rejects it too, so the button is
// disabled rather than letting the form submit into an error.
export default function TypeMultiSelect({
  value,
  onChange,
  options,
  ariaLabel = 'Target beneficiary type',
  disabled = false,
}) {
  const opts = options || FORM_TARGET_OPTIONS;

  const selected = normalizeTypes(value);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const popRef = useRef(null);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return undefined;

    const onDocPointerDown = (e) => {
      const inTrigger = ref.current && ref.current.contains(e.target);
      const inPop = popRef.current && popRef.current.contains(e.target);
      if (!inTrigger && !inPop) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onDocPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Same fixed-coordinate placement as FilterPill: the menu is portalled to
  // <body>, and anchored absolutely it would be clipped by .modal-body's
  // overflow-y: auto inside the edit modals.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return undefined;
    }

    const place = () => {
      const t = ref.current;
      const p = popRef.current;
      if (!t || !p) return;

      const gap = 6;
      const margin = 8;
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      const r = t.getBoundingClientRect();
      const w = p.offsetWidth;
      const h = p.offsetHeight;

      let top = r.bottom + gap;
      if (top + h > vh - margin && r.top - gap - h >= margin) top = r.top - gap - h;
      top = Math.max(margin, Math.min(top, vh - margin - h));

      let left = r.left;
      if (left + w > vw - margin) left = Math.max(margin, vw - margin - w);
      if (left < margin) left = margin;

      setPos({ top, left, width: Math.max(w, r.width) });
    };

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  const labelOf = (o) => (o && typeof o === 'object' ? o.label ?? String(o.value) : String(o));
  const valueOf = (o) => (o && typeof o === 'object' ? o.value : o);

  const toggle = (v) => onChange?.(toggleTypes(selected, v));

  // Removing a chip is the same operation as unticking its checkbox, so it obeys
  // the same exclusivity rules via removeType.
  const removeChip = (v) => onChange?.(removeType(selected, v));

  const chipLabel = (v) => {
    const found = opts.find((o) => valueOf(o) === v);
    return found ? labelOf(found) : String(v);
  };

  const lastChip = selected.length <= 1;

  // The trigger is a div rather than a <button> because the closed state renders
  // per-chip remove buttons inside it, and nesting interactive elements inside
  // a <button> is invalid HTML that breaks both click handling and screen
  // readers. role="button" plus the keyboard handlers keeps it operable.
  const openOnKey = (e) => {
    if (disabled || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    setOpen((v) => !v);
  };

  return (
    <div className="type-multi" ref={ref}>
      <div
        className="type-multi-btn"
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-disabled={disabled || undefined}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={openOnKey}
      >
        {selected.length === 0 ? (
          <span className="type-multi-placeholder">Select target types</span>
        ) : (
          <span className="type-multi-chips">
            {selected.map((v) => (
              <span key={v} className={`chip chip-${v}`}>
                {chipLabel(v)}
                <button
                  type="button"
                  className="chip-x"
                  aria-label={`Remove ${chipLabel(v)}`}
                  // Stop the click from toggling the dropdown open underneath.
                  onClick={(e) => {
                    e.stopPropagation();
                    removeChip(v);
                  }}
                  disabled={lastChip}
                >
                  <Icon name="x" size={11} />
                </button>
              </span>
            ))}
          </span>
        )}
        <Icon name="chevron-down" size={14} className="filter-pill-chevron" />
      </div>

      {open && createPortal(
        <div
          ref={popRef}
          className="filter-pill-menu type-multi-menu"
          role="listbox"
          aria-label={ariaLabel}
          aria-multiselectable="true"
          style={pos ? { top: pos.top, left: pos.left, minWidth: pos.width } : { visibility: 'hidden' }}
        >
          {opts.map((o) => {
            const ov = valueOf(o);
            const isSelected = selected.includes(ov);
            return (
              <label
                key={String(ov)}
                className={`filter-pill-option type-multi-option ${isSelected ? 'is-selected' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(ov)}
                />
                <span>{labelOf(o)}</span>
              </label>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}