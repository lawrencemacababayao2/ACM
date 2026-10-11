import React, { useEffect } from 'react';
import Icon from './Icon.jsx';

export default function Modal({ open, title, onClose, children, footer, size = 'md', side = false }) {
  // Escape has to be bound here rather than on the panel: the dialog is not
  // focused while it is open, so key events land on the document. Without this a
  // dialog whose only affordance is the corner X cannot be dismissed from the
  // keyboard at all.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  const modalClass = `modal ${side ? 'modal-side' : ''} ${size !== 'md' ? `modal-${size}` : ''}`;
  return (
    <div className="modal-backdrop" onDoubleClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={modalClass} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
        </div>
        <div className="modal-body">
          {typeof children === 'function' ? children() : children}
        </div>
        {footer && (
          <div className="modal-foot">{footer}</div>
        )}
      </div>
    </div>
  );
}