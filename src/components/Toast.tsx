import React, { createContext, useCallback, useContext, useState } from 'react';

type Kind = 'success' | 'error' | 'info';
interface Toast { id: number; kind: Kind; msg: string; }
interface Ctx { push: (kind: Kind, msg: string) => void; }

const ToastCtx = createContext<Ctx>({ push: () => {} });
export const useToast = () => useContext(ToastCtx);

const glyphs: Record<Kind, React.ReactNode> = {
  success: <path d="m4 12.5 5 5 11-11" />,
  error: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.4h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 16.5V11M12 7.6h.01" /></>,
};

let seq = 1;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((kind: Kind, msg: string) => {
    const id = seq++;
    setToasts((t) => [...t, { id, kind, msg }]);
    setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <svg className="toast-icon" width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                 aria-hidden="true">
              {glyphs[t.kind]}
            </svg>
            <span className="toast-msg">{t.msg}</span>
            <button className="toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>×</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
};
