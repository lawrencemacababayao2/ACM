import { useEffect, useLayoutEffect, useState } from 'react';

/**
 * Closes the popover on outside click or Escape while it is open.
 *
 * `popRef` is the portalled popover, if the caller portals one. It has to be
 * tested separately because portalling moves it out of `ref`'s subtree: without
 * it, a click on the popover itself reads as an outside click and closes it.
 */
export function useDismissOnOutside(open, ref, onClose, popRef) {
  useEffect(() => {
    if (!open) return undefined;

    const onDocPointerDown = (e) => {
      const inTrigger = ref.current && ref.current.contains(e.target);
      const inPop = popRef?.current && popRef.current.contains(e.target);
      if (!inTrigger && !inPop) onClose();
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', onDocPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, ref, onClose, popRef]);
}

/**
 * Viewport coordinates for a popover rendered with position: fixed.
 *
 * Popovers are portalled to the body because modals and .table-wrap scroll, so
 * an absolutely positioned menu would be clipped and scroll away from its
 * trigger. This flips above the trigger when there is no room below and clamps
 * to the window edges otherwise.
 */
export function usePopoverPlacement(open, triggerRef, popRef) {
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return undefined;
    }

    const place = () => {
      const t = triggerRef.current;
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
      if (top + h > vh - margin && r.top - gap - h >= margin) {
        top = r.top - gap - h;
      }
      // Neither side fits (short viewport): the body scrolls, so just keep the top
      // edge on screen.
      top = Math.max(margin, Math.min(top, vh - margin - h));
      // Scroll rather than clamp when the popover is wider than the gap allows,
      // so it never sits flush against an edge.
      let left = r.left;
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
  }, [open, triggerRef, popRef]);

  return pos;
}