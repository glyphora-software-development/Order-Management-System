import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { isSubmitted, statusLabels, type SalesOrder } from "../services/orderModel";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <header className="ui-heading">
    <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
    {actions && <div className="ui-actions">{actions}</div>}
  </header>;
}

export function EmptyState({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return <div className="ui-empty">
    <span className="ui-empty-mark" aria-hidden="true">—</span>
    <strong>{title}</strong>
    {detail && <p>{detail}</p>}
    {action}
  </div>;
}

export function OrderBadge({ order }: { order: SalesOrder }) {
  const status = isSubmitted(order) ? "pending" : order.status;
  return <span className={"ui-badge ui-status-" + status}>
    {status === "pending" ? "草稿 · 待确认" : statusLabels[order.status]}
  </span>;
}

export function TableScroll({ label, children }: { label: string; children: ReactNode }) {
  return <div className="ui-table-scroll" role="region" aria-label={label} tabIndex={0}>{children}</div>;
}

export function Modal({
  title, children, onClose, locked = false, className = "",
}: {
  title: string; children: ReactNode; onClose: () => void; locked?: boolean; className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const restore = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (restore instanceof HTMLElement && restore.isConnected) restore.focus();
    };
  }, []);

  return <dialog ref={dialog} className={"ui-dialog " + className} aria-labelledby={id}
    onCancel={(event) => { event.preventDefault(); if (!locked) onClose(); }}
    onClick={(event) => {
      if (event.target !== event.currentTarget || locked) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
    <header className="ui-dialog-heading">
      <h2 id={id}>{title}</h2>
      <button type="button" className="ui-icon-button" aria-label="关闭对话框" onClick={onClose} disabled={locked}>×</button>
    </header>
    {children}
  </dialog>;
}

export function ConfirmDialog({
  title, detail, confirmLabel, onConfirm, onClose, reasonRequired = false,
}: {
  title: string; detail: string; confirmLabel: string; onConfirm: (reason: string) => Promise<void> | void;
  onClose: () => void; reasonRequired?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const errorId = useId();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    if (reasonRequired && !reason.trim()) {
      setError("请填写取消原因");
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败，请重试");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <Modal title={title} onClose={onClose} locked={busy}>
    <form className="ui-dialog-body" onSubmit={submit}>
      <p>{detail}</p>
      {reasonRequired && <label className="ui-field">
        取消原因 <span aria-hidden="true">*</span>
        <textarea rows={3} value={reason} onChange={(event) => { setReason(event.target.value); setError(""); }}
          required disabled={busy} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} />
      </label>}
      {error && <p id={errorId} className="ui-feedback ui-feedback-error" role="alert">{error}</p>}
      <div className="ui-actions ui-actions-end">
        <button type="button" className="ui-button" disabled={busy} onClick={onClose}>返回</button>
        <button className="ui-button ui-button-danger" disabled={busy} type="submit">{busy ? "处理中…" : confirmLabel}</button>
      </div>
    </form>
  </Modal>;
}

export function ChartBars({ label, rows }: { label: string; rows: { label: string; value: bigint; formatted: string }[] }) {
  const max = rows.reduce((current, row) => row.value > current ? row.value : current, 0n);
  return <ul className="ui-chart-bars" aria-label={label}>
    {rows.map((row, index) => <li key={row.label + index}>
      <span title={row.label}>{row.label}</span>
      <div className="ui-chart-track" aria-hidden="true">
        <i style={{ width: (max ? Number(row.value * 1000n / max) / 10 : 0) + "%" }} />
      </div>
      <strong>{row.formatted}</strong>
    </li>)}
  </ul>;
}
