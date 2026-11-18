import { needsPaymentReview, paymentSummary, type CommerceData } from "./commerceModel.ts";
import { isSubmitted, sortOrders, type SalesOrder } from "./orderModel.ts";
import { buildReports } from "./reportModel.ts";

export function dashboardOverview(data: CommerceData) {
  const report = buildReports(data, { from: "", to: "" });
  const orders = sortOrders(data.orders, "newest");
  const attention: { order: SalesOrder; label: string; tone: string; priority: number }[] = [];
  for (const order of orders) {
    if (order.status === "cancelled" || order.status === "completed") continue;
    if (needsPaymentReview(order)) attention.push({ order, label: "历史付款待核对", tone: "warning", priority: 0 });
    else if (isSubmitted(order)) attention.push({ order, label: "待确认", tone: "warning", priority: 1 });
    else if (order.status === "shipped") {
      const outstanding = paymentSummary(order, data.payments).remaining > 0;
      attention.push({ order, label: outstanding ? "已发货 · 待收款" : "已结清 · 待完成", tone: "processing", priority: 2 });
    } else if (order.status === "confirmed" || order.status === "processing") {
      attention.push({ order, label: "待履约", tone: "processing", priority: 3 });
    }
  }
  return {
    report,
    pending: orders.filter(isSubmitted).length,
    recentOrders: orders.slice(0, 6),
    attention: attention.sort((a, b) => a.priority - b.priority).slice(0, 5),
    lowStock: report.inventory.filter((item) => item.low)
      .sort((a, b) => a.product.currentStock - b.product.currentStock || a.product.sku.localeCompare(b.product.sku)).slice(0, 5),
    recentPayments: [...data.payments].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
      a.id.localeCompare(b.id)).slice(0, 5),
  };
}
