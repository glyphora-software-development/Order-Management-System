import {
  type CommerceData, type PaymentInput, type PaymentRecord, type Product,
  type StockMovement, paymentMethods, paymentSummary, needsPaymentReview,
} from "./commerceModel.ts";
import { isMinorAmount, isOrderDate, type SalesOrder } from "./orderModel.ts";

export interface BusinessRuntime {
  now(): string;
  id(): string;
}

export const browserRuntime: BusinessRuntime = {
  now: () => new Date().toISOString(),
  id: () => crypto.randomUUID(),
};

export function requireOperation(operationId: string): void {
  if (!operationId.trim()) throw new Error("缺少操作编号");
}

export function findOrder(data: CommerceData, id: string): SalesOrder {
  const order = data.orders.find((entry) => entry.id === id);
  if (!order) throw new Error("订单不存在");
  return order;
}

export function findProduct(data: CommerceData, id: string): Product {
  const product = data.products.find((entry) => entry.id === id);
  if (!product) throw new Error("商品不存在");
  return product;
}

export function moveStock(
  data: CommerceData, product: Product, quantity: number, type: StockMovement["type"],
  operationId: string, runtime: BusinessRuntime, orderId?: string,
): void {
  const previousStock = product.currentStock;
  const newStock = previousStock + quantity;
  if (newStock < 0) throw new Error(`库存不足：${product.sku} ${product.name}，现有 ${previousStock}，需要 ${-quantity}`);
  if (!Number.isSafeInteger(newStock)) throw new Error("库存数量超出支持范围");
  product.currentStock = newStock;
  data.movements.unshift({
    id: runtime.id(), productId: product.id, orderId, type, quantity,
    previousStock, newStock, operationId, createdAt: runtime.now(),
  });
}

export function deductStock(data: CommerceData, order: SalesOrder, runtime: BusinessRuntime): void {
  const needed = new Map<string, number>();
  for (const item of order.items) {
    if (!item.productId) throw new Error(`商品「${item.name}」缺少关联，请编辑草稿并选择商品后再确认`);
    needed.set(item.productId, (needed.get(item.productId) ?? 0) + item.quantity);
  }
  for (const [id, quantity] of needed) {
    const product = findProduct(data, id);
    if (product.archived || !product.active) throw new Error(`商品「${product.name}」已停售，请更新订单`);
    if (!Number.isSafeInteger(quantity)) throw new Error("商品数量超出支持范围");
    moveStock(data, product, -quantity, "deduction", order.id + ":confirm", runtime, order.id);
  }
}

export function restoreStock(data: CommerceData, order: SalesOrder, runtime: BusinessRuntime): void {
  const deductions = data.movements.filter((entry) => entry.orderId === order.id && entry.type === "deduction");
  for (const entry of deductions) {
    moveStock(data, findProduct(data, entry.productId), -entry.quantity, "restoration",
      order.id + ":cancel", runtime, order.id);
  }
}

export function addPayment(
  data: CommerceData, order: SalesOrder, input: PaymentInput, operationId: string, runtime: BusinessRuntime,
): PaymentRecord {
  requireOperation(operationId);
  const reference = input.reference?.trim() || undefined;
  const previous = data.payments.find((payment) => payment.operationId === operationId);
  if (previous) {
    if (previous.orderId !== order.id || previous.amountMinor !== input.amountMinor ||
        previous.method !== input.method || previous.date !== input.date || previous.reference !== reference) {
      throw new Error("该操作编号已用于另一笔付款");
    }
    return previous;
  }
  if (order.status === "draft" || order.status === "completed" || order.status === "cancelled") {
    throw new Error("当前订单不能登记付款");
  }
  if (needsPaymentReview(order)) throw new Error("请先核对旧付款标记");
  if (!isMinorAmount(input.amountMinor) || input.amountMinor === 0) throw new Error("付款金额必须大于零");
  if (!Object.hasOwn(paymentMethods, input.method) || !isOrderDate(input.date)) {
    throw new Error("请选择有效的付款方式及日期");
  }
  if (input.amountMinor > paymentSummary(order, data.payments).remaining) {
    throw new Error("累计付款不可超过订单应收金额");
  }
  const payment: PaymentRecord = {
    id: runtime.id(), orderId: order.id, amountMinor: input.amountMinor,
    method: input.method, date: input.date, reference, operationId, createdAt: runtime.now(),
  };
  data.payments.unshift(payment);
  return payment;
}
