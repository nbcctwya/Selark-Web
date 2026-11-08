import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { Button } from './ui';

/**
 * Native <dialog> gives us focus trapping, Esc and an inert background for free.
 * React propagates `close` through the component tree, so each dialog only reacts to its own.
 */
function useModal(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return ref;
}

export function Sheet({ open, onClose, title, eyebrow, subtitle, children, footer, labelId, busy = false }: { open: boolean; onClose: () => void; title: ReactNode; eyebrow?: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; labelId: string; busy?: boolean }) {
  const ref = useModal(open);
  return <dialog ref={ref} className="sheet" aria-labelledby={labelId} onClose={event => { if (event.target === ref.current) onClose(); }}
    onCancel={event => { if (busy) event.preventDefault(); }}
    onClick={event => { if (!busy && event.target === ref.current) ref.current?.close(); }}>
    {open && <div className="sheet-inner">
      <header className="sheet-head">
        <div className="sheet-titles">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h2 id={labelId}>{title}</h2>
          {subtitle && <p className="sheet-sub">{subtitle}</p>}
        </div>
        <Button variant="ghost" icon="close" aria-label="关闭详情" disabled={busy} onClick={() => ref.current?.close()} />
      </header>
      <div className="sheet-body">{children}</div>
      {footer && <footer className="sheet-foot">{footer}</footer>}
    </div>}
  </dialog>;
}

export function ConfirmDialog({ open, title, children, confirmLabel, onConfirm, onCancel, danger }: { open: boolean; title: string; children: ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void; danger?: boolean }) {
  const ref = useModal(open);
  return <dialog ref={ref} className="confirm" aria-labelledby="confirm-title" aria-describedby="confirm-body" onClose={event => { if (event.target === ref.current) onCancel(); }}>
    {open && <form method="dialog" onSubmit={event => { event.preventDefault(); onConfirm(); }}>
      <span className={`confirm-icon${danger ? ' danger' : ''}`}><Icon name="alert" size={20} /></span>
      <h2 id="confirm-title">{title}</h2>
      <div id="confirm-body" className="confirm-body">{children}</div>
      <div className="confirm-actions">
        <Button onClick={() => ref.current?.close()} autoFocus>取消</Button>
        <button type="submit" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}>{confirmLabel}</button>
      </div>
    </form>}
  </dialog>;
}

export interface Toast { id: number; tone: 'good' | 'warn' | 'bad' | 'info'; text: string }
const ToastContext = createContext<(toast: Omit<Toast, 'id'>) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);
  const dismiss = useCallback((id: number) => setToasts(list => list.filter(t => t.id !== id)), []);
  const push = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = ++next.current;
    setToasts(list => [...list.slice(-2), { ...toast, id }]);
    setTimeout(() => dismiss(id), toast.tone === 'good' ? 4500 : 9000);
  }, [dismiss]);
  const icon = { good: 'check', warn: 'alert', bad: 'alert', info: 'info' } as const;
  return <ToastContext.Provider value={push}>
    {children}
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map(toast => <div key={toast.id} className={`toast toast-${toast.tone}`}>
        <Icon name={icon[toast.tone]} size={17} />
        <p>{toast.text}</p>
        <button type="button" className="toast-close" aria-label="关闭提示" onClick={() => dismiss(toast.id)}><Icon name="close" size={14} /></button>
      </div>)}
    </div>
  </ToastContext.Provider>;
}
