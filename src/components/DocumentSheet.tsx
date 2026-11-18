import { type BusinessDocument } from "../services/documentModel";
import { formatMinor } from "../services/orderModel";

export default function DocumentSheet({
  document: sheet, lines = sheet.lines, final = true, page,
}: {
  document: BusinessDocument;
  lines?: BusinessDocument["lines"];
  final?: boolean;
  page?: string;
}) {
  const invoice = sheet.kind === "invoice";
  return (
    <article className="document-sheet" aria-label={sheet.title}>
      <header className="document-header">
        <div className="document-brand">
          <span className="document-mark" aria-hidden="true">G</span>
          <div>
            <strong>Glyphora Demo</strong>
            <p>Glyphora Software Development<br />Demo Business Centre, Kuala Lumpur, Malaysia<br />accounts@glyphora.example</p>
          </div>
        </div>
        <div className="document-identity">
          <h1>{sheet.title}</h1>
          <strong>{sheet.number}</strong>
          <span>{sheet.status}</span>
        </div>
      </header>

      <div className="document-addresses">
        <section>
          <h2>{invoice ? "Bill to" : "Deliver to"}</h2>
          <strong>{sheet.customer}</strong>
          <p className="document-address">{sheet.address || "Address unavailable in order snapshot"}</p>
          {sheet.phone && <p>{sheet.phone}</p>}
          {sheet.email && <p>{sheet.email}</p>}
        </section>
        <dl>
          <div><dt>Order number</dt><dd>{sheet.orderId}</dd></div>
          <div><dt>Order date</dt><dd>{sheet.orderDate}</dd></div>
          {invoice ? (
            <div><dt>{sheet.invoiceDateFromOrder ? "Invoice date (order date)" : "Invoice date"}</dt><dd>{sheet.invoiceDate}</dd></div>
          ) : (
            <div><dt>Shipment date</dt><dd>{sheet.shipmentDate ?? "Unavailable"}</dd></div>
          )}
        </dl>
      </div>

      <table className={invoice ? "document-table document-invoice-table" : "document-table"}>
        <colgroup>{invoice ? <>
          <col style={{ width: "35%" }} /><col style={{ width: "16%" }} /><col style={{ width: "9%" }} />
          <col style={{ width: "20%" }} /><col style={{ width: "20%" }} />
        </> : <><col style={{ width: "64%" }} /><col style={{ width: "21%" }} /><col style={{ width: "15%" }} /></>}</colgroup>
        <thead><tr>
          <th scope="col">Item</th><th scope="col">SKU</th><th scope="col" className="document-numeric">Qty</th>
          {invoice && <><th scope="col" className="document-numeric">Unit price</th><th scope="col" className="document-numeric">Amount</th></>}
        </tr></thead>
        <tbody>{lines.map((line) => (
          <tr key={line.id}>
            <td>{line.name}</td><td>{line.sku || "Unavailable"}</td>
            <td className="document-numeric">{line.quantity}</td>
            {invoice && <>
              <td className="document-numeric">{formatMinor(line.priceMinor)}</td>
              <td className="document-numeric">{formatMinor(line.amountMinor)}</td>
            </>}
          </tr>
        ))}</tbody>
      </table>

      {final && <section className="document-end">
        {invoice ? <>
          <dl className="document-totals">
            <div><dt>Subtotal</dt><dd>{formatMinor(sheet.subtotalMinor)}</dd></div>
            {sheet.discountMinor !== undefined && <div><dt>Discount</dt><dd>{formatMinor(sheet.discountMinor)}</dd></div>}
            {sheet.taxMinor !== undefined && <div><dt>Tax</dt><dd>{formatMinor(sheet.taxMinor)}</dd></div>}
            <div className="document-total"><dt>Total amount</dt><dd>{formatMinor(sheet.totalMinor)}</dd></div>
            <div><dt>Amount paid</dt><dd>{sheet.balanceMinor === undefined && sheet.paidMinor === 0
              ? "Unverified" : formatMinor(sheet.paidMinor)}</dd></div>
            <div><dt>Balance due</dt><dd>{sheet.balanceMinor === undefined ? "Pending review" : formatMinor(sheet.balanceMinor)}</dd></div>
            <div><dt>Payment status</dt><dd>{sheet.paymentStatus}</dd></div>
            {sheet.paymentTerms && <div><dt>Payment terms</dt><dd>{sheet.paymentTerms}</dd></div>}
          </dl>
          {sheet.snapshotDifference && <p>Order total reflects the saved historical amount.</p>}
        </> : <>
          <p>{sheet.shipmentNote}</p>
          <div className="document-signatures">
            <span>Recipient signature</span><span>Printed name / date</span>
          </div>
        </>}
      </section>}
      <footer className="document-footer">
        <span>{invoice ? "Portfolio demonstration invoice. No tax invoice is issued." : "Portfolio demonstration delivery order."}</span>
        {page && <span>{page}</span>}
      </footer>
    </article>
  );
}
