import React, { useState } from 'react';
import Modal from './Modal';

// A confirmation that has to be typed, for actions that remove many rows and
// cannot be undone. One click is too easy to give by accident.
const TypeConfirm: React.FC<{
  title: string;
  message: React.ReactNode;
  word?: string;
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}> = ({ title, message, word = 'DELETE', confirmLabel, onConfirm, onCancel }) => {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="mb">{message}</div>
      <p className="mb">Type <strong>{word}</strong> to confirm.</p>
      <input autoFocus value={text} onChange={(e) => setText(e.target.value)} className="mb" />
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="secondary" onClick={onCancel}>Cancel</button>
        <button
          className="danger"
          disabled={text !== word || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
};

export default TypeConfirm;
