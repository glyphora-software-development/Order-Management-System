import { businessDate } from "./businessDate.ts";
import { needsPaymentReview, paymentSummary, type PaymentRecord } from "./commerceModel.ts";
import { isMinorAmount, type OrderStatus, type SalesOrder } from "./orderModel.ts";

export type DocumentKind = "invoice" | "delivery";

export const documentTitle = { invoice: "Invoice", delivery: "Delivery Order" };
export const documentStatus: Record<OrderStatus, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function buildDocument(order: SalesOrder, ledger: readonly PaymentRecord[], kind: DocumentKind) {
  const confirmedAt = order.events.find((event) => event.status === "confirmed")?.at;
  const shippedAt = order.events.find((event) => event.status === "shipped")?.at;
  const shipmentDate = shippedAt ? businessDate(shippedAt) : undefined;
  const shipmentNote = shipmentDate ? "Shipment recorded. Receipt is awaiting signature."
    : order.status === "shipped" || order.status === "completed" ? "Historical shipment date unavailable."
      : order.status === "cancelled" ? "Order cancelled. No shipment recorded." : "No shipment recorded.";
  const summary = paymentSummary(order, ledger);
  const review = needsPaymentReview(order);
  const lines = order.items.map((item) => ({ ...item, amountMinor: item.quantity * item.priceMinor }));
  const subtotalMinor = lines.reduce((sum, line) => sum + BigInt(line.amountMinor), 0n);
  const discountMinor = isMinorAmount(order.discountMinor) ? order.discountMinor : undefined;
  const taxMinor = isMinorAmount(order.taxMinor) ? order.taxMinor : undefined;
  return {
    kind,
    title: documentTitle[kind],
    number: (kind === "invoice" ? "INV-" : "DO-") + order.id,
    orderId: order.id,
    orderDate: order.date,
    invoiceDate: confirmedAt ? businessDate(confirmedAt) : order.date,
    invoiceDateFromOrder: !confirmedAt,
    shipmentDate,
    shipmentNote,
    status: documentStatus[order.status],
    customer: order.customer,
    address: kind === "invoice" ? order.customerSnapshot?.billingAddress : order.customerSnapshot?.deliveryAddress,
    phone: order.customerSnapshot?.phone,
    email: order.customerSnapshot?.email,
    lines,
    subtotalMinor,
    discountMinor,
    taxMinor,
    totalMinor: order.totalMinor,
    snapshotDifference: subtotalMinor - BigInt(discountMinor ?? 0) + BigInt(taxMinor ?? 0) !== BigInt(order.totalMinor),
    paidMinor: summary.paid,
    balanceMinor: review ? undefined : summary.remaining,
    paymentStatus: review ? "Historical payment review required" :
      summary.status === "paid" ? "Paid" : summary.status === "partial" ? "Partially paid" : "Unpaid",
    paymentTerms: order.paymentTerms?.trim() || undefined,
  };
}

export type BusinessDocument = ReturnType<typeof buildDocument>;

/** Reserve space for totals or signatures exclusively on the final page. */
export function paginateDocumentRows(heights: readonly number[], budget: number, finalBudget = budget): number[][] {
  if (!Number.isFinite(budget) || !Number.isFinite(finalBudget) || finalBudget < 0 || finalBudget > budget || budget <= 0) {
    throw new Error("Document header or summary exceeds one A4 page");
  }
  for (const height of heights) {
    if (!Number.isFinite(height) || height <= 0 || height > budget) {
      throw new Error("One product row exceeds the available A4 page height");
    }
  }
  let finalStart = heights.length;
  let used = 0;
  while (finalStart > 0 && used + heights[finalStart - 1] <= finalBudget) {
    used += heights[--finalStart];
  }
  const pages: number[][] = [];
  used = budget;
  for (let index = 0; index < finalStart; index++) {
    const height = heights[index];
    if (used + height > budget) {
      pages.push([]);
      used = 0;
    }
    pages[pages.length - 1].push(index);
    used += height;
  }
  pages.push(Array.from({ length: heights.length - finalStart }, (_, index) => finalStart + index));
  return pages;
}
