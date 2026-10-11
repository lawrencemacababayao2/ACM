import React from 'react';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';

export default function Confirm({ open, title = 'Are you sure?', message = '', confirmLabel = 'Delete', danger = true, busy = false, onConfirm, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={title} footer={
      <>
        <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm} disabled={busy}>
          {busy ? 'Working…' : (<><Icon name="check" size={13} /> {confirmLabel}</>)}
        </button>
      </>
    }>
      <p style={{ margin: 0, color: '#334155', fontSize: 14, lineHeight: 1.5 }}>{message}</p>
    </Modal>
  );
}