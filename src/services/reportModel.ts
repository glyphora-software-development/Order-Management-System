import { businessDate } from "./businessDate.ts";
import { needsPaymentReview, stockStatus, type CommerceData } from "./commerceModel.ts";
import { isOrderDate, statusLabels, type OrderStatus, type SalesOrder } from "./orderModel.ts";

export interface DateRange {
  from: string;
  to: string;
}

export function validReportRange({ from, to }: DateRange): boolean {
  return (!from || isOrderDate(from)) && (!to || isOrderDate(to)) && (!from || !to || from <= to);
}

function matches(date: string, { from, to }: DateRange): boolean {
  return (!from || date >= from) && (!to || date <= to);
}

export function isEffectiveSale(order: SalesOrder): boolean {
  return order.status !== "draft" && order.status !== "cancelled";
}

export function effectiveSalesTotal(orders: readonly SalesOrder[]): bigint {
  return orders.reduce((sum, order) => isEffectiveSale(order) ? sum + BigInt(order.totalMinor) : sum, 0n);
}

export function buildReports(data: CommerceData, range: DateRange) {
  if (!validReportRange(range)) throw new Error("日期范围无效，开始日期须早于或等于结束日期。");
  const orders = data.orders.filter((order) => matches(order.date, range));
  const sales = orders.filter(isEffectiveSale);
  const statuses = (Object.keys(statusLabels) as OrderStatus[]).map((status) => ({
    status, count: orders.filter((order) => order.status === status).length,
  }));

  const daily = new Map<string, bigint>();
  const products = new Map<string, { key: string; name: string; sku?: string; quantity: bigint; amountMinor: bigint }>();
  for (const order of sales) {
    daily.set(order.date, (daily.get(order.date) ?? 0n) + BigInt(order.totalMinor));
    for (const item of order.items) {
      const key = item.productId ? "id:" + item.productId : "snapshot:" + JSON.stringify([item.sku, item.name]);
      const existing = products.get(key) ?? { key, name: item.name, sku: item.sku, quantity: 0n, amountMinor: 0n };
      existing.quantity += BigInt(item.quantity);
      existing.amountMinor += BigInt(item.quantity) * BigInt(item.priceMinor);
      products.set(key, existing);
    }
  }

  let collectedMinor = 0n;
  const paidByOrder = new Map<string, bigint>();
  for (const entry of data.payments) {
    const amount = BigInt(entry.amountMinor);
    if (matches(entry.date, range)) collectedMinor += amount;
    paidByOrder.set(entry.orderId, (paidByOrder.get(entry.orderId) ?? 0n) + amount);
  }

  let balanceMinor = 0n;
  let partial = 0;
  let unpaid = 0;
  let needsReview = 0;
  for (const order of sales) {
    if (needsPaymentReview(order)) {
      needsReview++;
      continue;
    }
    const paid = paidByOrder.get(order.id) ?? 0n;
    const balance = BigInt(order.totalMinor) - paid;
    balanceMinor += balance;
    if (balance > 0n && paid > 0n) partial++;
    if (balance > 0n && paid === 0n) unpaid++;
  }

  const withMovements = new Set(data.movements.map((entry) => entry.productId));
  const inventory = data.products.filter((product) => !product.archived).map((product) => {
    const known = withMovements.has(product.id);
    return {
      product, known,
      stock: known ? product.currentStock : undefined,
      status: known ? stockStatus(product) : "库存未初始化",
      low: known && product.currentStock <= product.lowStockThreshold,
    };
  });

  return {
    salesMinor: effectiveSalesTotal(orders),
    totalOrders: orders.length,
    salesCount: sales.length,
    statuses,
    trend: Array.from(daily, ([date, amountMinor]) => ({ date, amountMinor }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    topProducts: [...products.values()].sort((a, b) =>
      a.quantity === b.quantity ? a.key.localeCompare(b.key) : a.quantity > b.quantity ? -1 : 1,
    ).slice(0, 10),
    collectedMinor, balanceMinor, partial, unpaid, needsReview,
    inventory,
    lowCount: inventory.filter((entry) => entry.low).length,
    unknownCount: inventory.filter((entry) => !entry.known).length,
    movements: data.movements.filter((entry) => matches(businessDate(entry.createdAt), range)),
  };
}
