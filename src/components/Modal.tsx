import React from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  variant?: 'modal' | 'drawer';
}

const Modal: React.FC<Props> = ({ title, onClose, children, variant = 'modal' }) => {
  // Escape closes, and the page behind stops scrolling while a panel is open —
  // otherwise the wheel scrolls the list underneath the drawer you are reading.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        className={variant}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="panel-head">
          <h2>{title}</h2>
          <button className="ghost" aria-label="Close" onClick={onClose}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="panel-body">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
