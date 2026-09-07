import React from 'react';
import Modal from './Modal';

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const Confirm: React.FC<Props> = ({ title, message, confirmLabel = 'Confirm', danger, onConfirm, onCancel }) => (
  <Modal title={title} onClose={onCancel}>
    <p className="muted" style={{ margin: '0 0 20px', lineHeight: 1.6 }}>{message}</p>
    <div className="row end">
      <button className="secondary" onClick={onCancel}>Cancel</button>
      <button className={danger ? 'danger' : ''} autoFocus onClick={onConfirm}>{confirmLabel}</button>
    </div>
  </Modal>
);

export default Confirm;
