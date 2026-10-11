import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

// A chip-shaped select replacement. The list keeps a fixed order so items never
// move under the cursor; the current choice is shown with the green highlight on
// its row. Option values and ordering are the caller's business.
//
// `variant="filter"` is the toolbar pill: compact, and filled green when a real
// value is set. `variant="field"` is the form control: full width, square-ish 9px
// corners to match the surrounding inputs, and never filled, because a form field
// showing a value is the expected state rather than an active filter.
//
// `onRemoveOption` is given for a list the caller maintains rather than merely reads.
// When present, each row carries a small ✕ so an entry can be taken off the list from
// where it is chosen. The menu is only the vehicle for the choice; whether removing is
// allowed, and what it warns about, is decided by the caller, which is also the only
// layer that can see how many records depend on the entry.
//
// The menu is portalled to <body> and placed with fixed coordinates. Anchored
// absolutely it would be clipped by any scrolling ancestor, which inside the edit
// modals is .modal-body (overflow-y: auto).
export default function FilterPill({
  ariaLabel,
  placeholder = 'Select',
  value,
  options = [],
  onChange,
  onRemoveOption,
  disabled = false,
  variant = 'filter',
  menuWidth,
  multiple = false,
  id,
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const popRef = useRef(null);

  // A cascading pair (province -> barangay) can become invalid while the menu is
  // open; a disabled trigger must not stay open.
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
      // Flip above when the menu would run past the bottom of the window.
      if (top + h > vh - margin && r.top - gap - h >= margin) top = r.top - gap - h;
      top = Math.max(margin, Math.min(top, vh - margin - h));

      // Keep the trigger's left edge where possible so the menu reads as attached,
      // then pull it back on screen rather than letting it hang off the edge.
      let left = r.left;
      if (left + w > vw - margin) left = Math.max(margin, vw - margin - w);
      if (left < margin) left = margin;

      setPos({ top, left, width: menuWidth ?? Math.max(w, r.width) });
    };

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, menuWidth]);

  const valueOf = (o) => (o && typeof o === 'object' ? o.value : o);
  const labelOf = (o) => (o && typeof o === 'object' ? o.label ?? String(o.value) : String(o));

  // In `multiple` mode `value` is an array of selected option values and onChange
  // receives a new array. The menu stays open while picking, because a multi-select
  // that closes after one tick cannot express "any two of these".
  const chosen = multiple ? (Array.isArray(value) ? value : []) : [];
  const selected = multiple ? null : options.find((o) => valueOf(o) === value);

  const toggleOne = (ov) => {
    onChange(chosen.includes(ov) ? chosen.filter((entry) => entry !== ov) : [...chosen, ov]);
  };

  // Only a real entry can be taken off the list. A value starting with "__" is a
  // caller's sentinel ("+ Add new …") rather than something stored, and the empty
  // entry is the "clear this" choice rather than a member of the list, so neither
  // has a ✕.
  const canRemove = (ov) => (
    Boolean(onRemoveOption) && ov !== '' && ov != null && !String(ov).startsWith('__')
  );

  // A real selection, as opposed to the "All …" placeholder, fills the pill green
  // so an active filter is visible without opening the menu. Forms never fill.
  const isActive = variant === 'filter'
    && (multiple ? chosen.length > 0 : Boolean(selected) && value !== '' && value != null);

  let label = selected ? labelOf(selected) : placeholder;
  if (multiple) {
    if (chosen.length === 1) {
      // Fall back to the raw value if the option is no longer offered, so a stale
      // selection reads as its value rather than the string "undefined".
      const only = options.find((o) => valueOf(o) === chosen[0]);
      label = only ? labelOf(only) : String(chosen[0]);
    } else if (chosen.length > 1) {
      label = `${chosen.length} selected`;
    }
  }
  // A real value, not the empty choice. Callers that offer a "clear" entry as an
  // option (value '') would otherwise leave the pill looking selected while showing
  // its own placeholder text.
  const hasValue = multiple ? chosen.length > 0 : Boolean(selected) && value !== '' && value != null;

  const wrapperCls = [
    'filter-pill',
    `is-${variant}`,
    disabled ? 'is-disabled' : '',
  ].filter(Boolean).join(' ');

  const buttonCls = [
    'filter-pill-btn',
    variant === 'field' ? 'is-field' : '',
    isActive ? 'is-active' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={wrapperCls} ref={ref}>
      <button
        type="button"
        id={id}
        className={buttonCls}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`filter-pill-label ${hasValue ? '' : 'is-placeholder'}`}>{label}</span>
        <Icon name="chevron-down" size={14} className="filter-pill-chevron" />
      </button>

      {open && createPortal(
        <div
          ref={popRef}
          className="filter-pill-menu"
          role={multiple ? 'group' : 'listbox'}
          aria-label={ariaLabel}
          aria-multiselectable={multiple || undefined}
          style={pos ? { top: pos.top, left: pos.left, minWidth: pos.width } : { visibility: 'hidden' }}
        >
          {options.map((o) => {
            const ov = valueOf(o);
            if (multiple) {
              const isSelected = chosen.includes(ov);
              return (
                <label
                  key={String(ov)}
                  className={`filter-pill-option type-multi-option ${isSelected ? 'is-selected' : ''}`}
                >
                  <input type="checkbox" checked={isSelected} onChange={() => toggleOne(ov)} />
                  <span>{labelOf(o)}</span>
                </label>
              );
            }
            const isSelected = ov === value;
            const row = (
              <button
                key={String(ov)}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`filter-pill-option ${isSelected ? 'is-selected' : ''}`}
                onClick={() => {
                  onChange(ov);
                  setOpen(false);
                }}
              >
                {labelOf(o)}
              </button>
            );
            if (!canRemove(ov)) return row;
            return (
              // The row and its ✕ sit side by side rather than one inside the other:
              // a button cannot hold a button, and nesting would make the pick fire
              // twice when the ✕ is clicked.
              <div key={String(ov)} className="filter-pill-option-row">
                {row}
                <button
                  type="button"
                  className="filter-pill-remove"
                  title={`Remove ${labelOf(o)}`}
                  aria-label={`Remove ${labelOf(o)} from this list`}
                  onClick={() => {
                    // Left open: the picker stays where it was, so the entry that
                    // disappears is seen in place rather than the whole list closing.
                    onRemoveOption(ov);
                  }}
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}