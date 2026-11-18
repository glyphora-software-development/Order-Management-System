import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCommerce } from "../components/commerceContext";
import DocumentSheet from "../components/DocumentSheet";
import { useToast } from "../components/toastContext";
import { buildDocument } from "../services/documentModel";
import "./Documents.css";

export default function Documents() {
  const { orderId, kind } = useParams();
  const { orders, payments } = useCommerce();
  const order = orders.find((entry) => entry.id === orderId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const exporting = useRef(false);
  const toast = useToast();
  const sheet = order && (kind === "invoice" || kind === "delivery") ? buildDocument(order, payments, kind) : undefined;
  const title = sheet ? sheet.title + " " + sheet.number : undefined;

  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = title;
    return () => { document.title = previous; };
  }, [title]);

  if (!order || !sheet) return (
    <p role="alert">找不到该订单单据。<Link to="/orders">返回订单管理</Link></p>
  );

  const base = "/orders/" + encodeURIComponent(order.id) + "/documents/";

  async function download() {
    if (exporting.current || !sheet) return;
    exporting.current = true;
    setBusy(true);
    setError("");
    try {
      const { exportDocumentPdf } = await import("../services/documentPdf");
      await exportDocumentPdf(sheet);
      toast("PDF 已导出");
    } catch (cause) {
      setError(cause instanceof Error ? "PDF 导出失败：" + cause.message : "PDF 导出失败");
    } finally {
      exporting.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="document-preview">
      <header className="document-toolbar">
        <nav aria-label="单据预览">
          <Link to={"/orders?order=" + encodeURIComponent(order.id)}>← 返回订单详情</Link>
          <Link to={base + "invoice"} aria-current={kind === "invoice" ? "page" : undefined}>Invoice</Link>
          <Link to={base + "delivery"} aria-current={kind === "delivery" ? "page" : undefined}>Delivery Order</Link>
        </nav>
        <div>
          <button type="button" className="ui-button" disabled={busy} onClick={() => window.print()}>打印</button>
          <button type="button" className="orders-new-button ui-button" disabled={busy} onClick={download}>
            {busy ? "正在导出…" : "导出 PDF"}
          </button>
        </div>
      </header>
      {error && <p className="orders-error" role="alert">{error}</p>}
      <DocumentSheet document={sheet} />
    </div>
  );
}
