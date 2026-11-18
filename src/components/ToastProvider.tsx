import { useEffect, useState, type ReactNode } from "react";
import { ToastContext } from "./toastContext";

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string }>();
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(undefined), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  return <ToastContext.Provider value={(message) => setToast({ message })}>
    {children}
    <div className="ui-toast-region" aria-live="polite">
      {toast && <div className="ui-toast">
        <span aria-hidden="true">✓</span><span>{toast.message}</span>
        <button className="ui-icon-button" aria-label="关闭通知" onClick={() => setToast(undefined)}>×</button>
      </div>}
    </div>
  </ToastContext.Provider>;
}
