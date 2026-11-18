import { useRef, useState, type FormEvent } from "react";
import { useToast } from "./toastContext";
import { commerce } from "../services/commerceClient";
import { needsPaymentReview, paymentMethods, paymentSummary, type PaymentInput, type PaymentRecord } from "../services/commerceModel";
import { formatMinor, parseMinor, paymentLabels, type SalesOrder } from "../services/orderModel";

function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export default function OrderPayments({ order, ledger }: { order: SalesOrder; ledger: PaymentRecord[] }) {
  const { paid, remaining, status } = paymentSummary(order, ledger);
  const history = ledger.filter((entry) => entry.orderId === order.id);
  const review = needsPaymentReview(order);
  const terminal = order.status === "completed" || order.status === "cancelled";
  const canRecord = !terminal && order.status !== "draft" && remaining > 0;
  const showForm = !terminal && (review || canRecord);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentInput["method"]>("transfer");
  const [date, setDate] = useState(today);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [verified, setVerified] = useState(false);
  const [operation, setOperation] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const inFlight = useRef(false);
  const capturePayment = !review || (verified && canRecord);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const payment = capturePayment ? { amountMinor: parseMinor(amount), method, date, reference } : undefined;
      if (review) await commerce.reconcilePayment(order.id, note, operation, payment);
      else if (payment) await commerce.recordPayment(order.id, payment, operation);
      setAmount("");
      setReference("");
      setNote("");
      setVerified(false);
      setOperation(crypto.randomUUID());
      toast(review ? "历史付款已核对" : "付款已登记");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "付款操作失败");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="orders-payments" aria-label="付款管理">
      <h3>付款进度</h3>
      <dl className="orders-payment-summary">
        <div><dt>订单总额</dt><dd>{formatMinor(order.totalMinor)}</dd></div>
        <div><dt>已登记实收</dt><dd>{formatMinor(paid)}</dd></div>
        <div><dt>剩余应收</dt><dd>{review ? "待核对" : formatMinor(remaining)}</dd></div>
        <div><dt>付款状态</dt><dd>{review ? "历史资料待核对" : paymentLabels[status]}</dd></div>
      </dl>
      {order.legacy?.paymentStatus && <p>V1 历史付款标记：{paymentLabels[order.legacy.paymentStatus]}</p>}
      {order.legacyPaymentStatus && <p>V2 历史付款标记：{paymentLabels[order.legacyPaymentStatus]}</p>}
      {order.paymentReview && <p>核对依据：{order.paymentReview.note}</p>}
      {showForm && (
        <form className="orders-payment-form" onSubmit={submit}>
          {review && <>
            <p>请按付款凭证核对旧标记。没有实收时选择「核对为零」；有实收时请输入凭证金额。</p>
            <label>核对结果
              <select value={verified ? "payment" : "zero"} onChange={(event) => setVerified(event.target.value === "payment")}>
                <option value="zero">核对为零</option>
                {canRecord && <option value="payment">登记已核实付款</option>}
              </select>
            </label>
            {!canRecord && order.status === "draft" && <p>有实收的草稿可在确认订单后登记已核实付款。</p>}
            <label>核对依据
              <input required value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
          </>}
          {capturePayment && <>
            <label>付款金额 (RM)
              <input type="number" min="0.01" step="0.01" required value={amount}
                onChange={(event) => setAmount(event.target.value)} />
            </label>
            <label>付款方式
              <select value={method} onChange={(event) => setMethod(event.target.value as PaymentInput["method"])}>
                {Object.entries(paymentMethods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>付款日期
              <input type="date" required value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <label>参考编号（选填）
              <input value={reference} onChange={(event) => setReference(event.target.value)} />
            </label>
          </>}
          <button type="submit" className="orders-new-button" disabled={busy}>
            {review ? "保存付款核对" : "登记付款"}
          </button>
        </form>
      )}
      {error && <p className="orders-error" role="alert">{error}</p>}
      <h3>付款历史</h3>
      {history.length ? (
        <ul className="orders-timeline">{history.map((entry) => (
          <li key={entry.id}>
            <strong>{formatMinor(entry.amountMinor)} · {paymentMethods[entry.method]}</strong>
            <time dateTime={entry.date}>{entry.date}</time>
            {entry.reference && <span>参考编号：{entry.reference}</span>}
          </li>
        ))}</ul>
      ) : <p>暂无付款记录。</p>}
    </section>
  );
}
