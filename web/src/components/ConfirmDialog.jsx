import React, { useEffect, useRef } from 'react';
import { useDismissOnOutside } from './usePopover.js';
import Icon from './Icon.jsx';

/**
 * Reusable in-app confirmation dialog. Replaces native window.confirm/alert.
 *
 * Props:
 *   open: boolean - whether the dialog is visible
 *   title: string - dialog title
 *   message: string|ReactNode - dialog message
 *   confirmLabel: string - confirm button text (default: 'Confirm')
 *   cancelLabel: string - cancel button text (default: 'Cancel')
 *   danger: boolean - whether the confirm action is destructive (red button)
 *   onConfirm: () => void - called when user confirms
 *   onClose: () => void - called when user cancels or dismisses
 *   variant: 'confirm' | 'alert' - 'alert' shows only OK button
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onClose,
  variant = 'confirm',
}) {
  const ref = useRef(null);
  const triggerRef = useRef(null);
  useDismissOnOutside(open, ref, onClose);

  useEffect(() => {
    if (open) {
      // Focus trap: focus the confirm button on open
      setTimeout(() => {
        const btn = ref.current?.querySelector('[data-confirm]');
        btn?.focus();
      }, 50);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" ref={ref} onClick={onClose}>
      <div
        className="modal is-confirm"
        ref={triggerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 id="confirm-title" className="modal-title">{title}</h3>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <p id="confirm-message">{message}</p>
        </div>
        <div className="modal-foot">
          {variant !== 'alert' && (
            <button
              type="button"
              className="btn"
              onClick={onClose}
              disabled={false}
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            className={`btn ${danger ? 'danger' : 'primary'}`}
            data-confirm
            onClick={() => {
              onConfirm?.();
              onClose?.();
            }}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}