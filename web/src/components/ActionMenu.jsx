import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

// A kebab menu for the actions that should not sit exposed on the row. Closes on
// outside click, on Escape, and after an item is chosen. Stops propagation so
// picking an item never also triggers the row's click-to-open-details handler.
//
// An item may be passed as { disabled: true, disabledReason: '...' }. It renders
// greyed out, cannot be chosen, and carries the reason as a tooltip. That is
// deliberate: for a blocked destructive action the explanation is the useful part,
// and silently omitting the entry leaves the reader wondering whether the system
// forgot it. The trigger accepts the same two props to disable the whole menu.
//
// The menu is portalled to <body> and positioned with fixed coordinates. Inside the
// table it was absolutely positioned, which put it below .table-wrap (overflow-x:
// auto) and .table-card (overflow: hidden) in the clipping chain, so it got cut off
// at the table edges and scrolled away with the rows.
export default function ActionMenu({ items = [], align = 'right', disabled = false, disabledReason = '' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const popRef = useRef(null);

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

  // Measure once mounted, and keep up with scrolling or resizing so the menu tracks
  // its trigger instead of drifting when the table moves.
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

      let left = align === 'left' ? r.left : r.right - w;
      if (left + w > vw - margin) left = Math.max(margin, vw - margin - w);
      if (left < margin) left = margin;

      setPos({ top, left });
    };

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align]);

  return (
    <div className="action-menu" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Icon name="more" size={16} />
      </button>

      {open && createPortal(
        <div
          ref={popRef}
          className="action-menu-pop"
          role="menu"
          style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              aria-disabled={item.disabled || undefined}
              className={`action-menu-item ${item.danger ? 'danger' : ''} ${item.disabled ? 'is-disabled' : ''}`}
              title={item.disabled ? item.disabledReason : undefined}
              onClick={(e) => {
                e.stopPropagation();
                if (item.disabled) return;
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.icon && <Icon name={item.icon} size={14} />}
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}