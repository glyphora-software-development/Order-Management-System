import { availableStatuses, type OrderStatus, type PaymentStatus, type SalesOrder } from "./orderModel.ts";
import type { Customer } from "./masterDataStorage.ts";

export const COMMERCE_SCHEMA_VERSION = 3;

export interface Product {
  id: string;
  sku: string;
  name: string;
  priceMinor: number;
  active: boolean;
  createdAt: string;
  currentStock: number;
  lowStockThreshold: number;
  archived?: boolean;
  creationOperationId?: string;
}

export const paymentMethods = {
  cash: "现金",
  transfer: "银行转账",
  card: "银行卡",
  other: "其他",
} as const;

export interface PaymentInput {
  amountMinor: number;
  method: keyof typeof paymentMethods;
  date: string;
  reference?: string;
}

export interface PaymentRecord extends PaymentInput {
  id: string;
  orderId: string;
  createdAt: string;
  operationId: string;
}

export const movementLabels = {
  opening: "期初库存",
  adjustment: "手动调整",
  deduction: "订单确认扣减",
  restoration: "订单取消恢复",
} as const;

export interface StockMovement {
  id: string;
  productId: string;
  orderId?: string;
  type: keyof typeof movementLabels;
  quantity: number;
  previousStock: number;
  newStock: number;
  createdAt: string;
  operationId: string;
}

export interface CommerceData {
  schemaVersion: typeof COMMERCE_SCHEMA_VERSION;
  orders: SalesOrder[];
  products: Product[];
  payments: PaymentRecord[];
  movements: StockMovement[];
  legacySource?: boolean;
  demo?: { version: number; generation: number; customers: Customer[] };
}

export function paymentSummary(order: SalesOrder, payments: readonly PaymentRecord[]) {
  const paid = payments.filter((entry) => entry.orderId === order.id)
    .reduce((sum, entry) => sum + entry.amountMinor, 0);
  const remaining = order.totalMinor - paid;
  const status: PaymentStatus = paid === 0 ? "unpaid" : remaining === 0 ? "paid" : "partial";
  return { paid, remaining, status };
}

export function needsPaymentReview(order: SalesOrder): boolean {
  return !order.paymentReview && Boolean(order.legacyPaymentStatus || order.legacy?.paymentStatus);
}

export function transitionError(order: SalesOrder, status: OrderStatus, payments: readonly PaymentRecord[]): string | undefined {
  if (!availableStatuses(order).includes(status)) return "当前订单无法变更到所选状态";
  const payment = paymentSummary(order, payments);
  if (status === "completed" && (needsPaymentReview(order) || payment.remaining !== 0)) {
    return "完成订单前须核对历史付款并结清余额";
  }
  if (status === "cancelled" && (needsPaymentReview(order) || payment.paid > 0)) {
    return "存在待核对或已登记的付款，不能普通取消订单";
  }
}

export function stockStatus(product: Product): string {
  if (product.currentStock === 0) return "缺货";
  return product.currentStock <= product.lowStockThreshold ? "库存偏低" : "库存正常";
}

export function stockForOrder(order: SalesOrder, movements: readonly StockMovement[]): string {
  if (movements.some((entry) => entry.orderId === order.id && entry.type === "restoration")) return "已恢复库存";
  if (movements.some((entry) => entry.orderId === order.id && entry.type === "deduction")) return "已扣减库存";
  return order.status === "draft" ? "确认时检查并扣减库存" : "无扣减记录";
}
