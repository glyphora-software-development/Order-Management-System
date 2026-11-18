export const ORDER_SCHEMA_VERSION = 2;

export const statusLabels = {
  draft: "草稿",
  confirmed: "已确认",
  processing: "处理中",
  shipped: "已发货",
  completed: "已完成",
  cancelled: "已取消",
} as const;
export type OrderStatus = keyof typeof statusLabels;
export type LegacyOrderStatus = OrderStatus | "pending";

export const paymentLabels = {
  unpaid: "未付款",
  partial: "部分付款",
  paid: "已付清",
} as const;
export type PaymentStatus = keyof typeof paymentLabels;

export interface OrderItem {
  id: string;
  productId?: string;
  sku?: string;
  name: string;
  quantity: number;
  priceMinor: number;
}

export interface OrderEvent {
  status: OrderStatus;
  at: string;
  cancellationReason?: string;
}

export interface OrderInput {
  customer: string;
  customerId?: string;
  customerSnapshot?: {
    email?: string;
    phone?: string;
    billingAddress?: string;
    deliveryAddress?: string;
  };
  date: string;
  items: OrderItem[];
  remarks: string;
}

export interface SalesOrder extends OrderInput {
  discountMinor?: number;
  taxMinor?: number;
  paymentTerms?: string;
  id: string;
  status: OrderStatus;
  totalMinor: number;
  createdAt: string;
  submittedAt?: string;
  cancellationReason?: string;
  events: OrderEvent[];
  demoPaymentStatus?: PaymentStatus;
  legacyPaymentStatus?: PaymentStatus;
  paymentReview?: { at: string; note: string; operationId: string };
  creationOperationId?: string;
  legacy?: {
    status: LegacyOrderStatus;
    paymentStatus?: PaymentStatus;
  };
}

export interface OrderData {
  schemaVersion: typeof ORDER_SCHEMA_VERSION;
  orders: SalesOrder[];
}

const transitions: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["completed"],
  completed: [],
  cancelled: [],
};

export function availableStatuses(order: SalesOrder): readonly OrderStatus[] {
  return transitions[order.status];
}

export function isEditable(order: SalesOrder): boolean {
  return order.status === "draft";
}

export function isSubmitted(order: SalesOrder): boolean {
  return order.status === "draft" && Boolean(order.submittedAt || order.legacy?.status === "pending");
}

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === "string" && Object.hasOwn(paymentLabels, value);
}

export function isMinorAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function parseMinor(value: string): number {
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(value)) throw new Error("金额最多保留两位小数");
  const [whole, fraction = ""] = value.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!isMinorAmount(minor)) throw new Error("金额超出支持范围");
  return minor;
}

export function calculateTotal(items: readonly OrderItem[]): number {
  let total = 0;
  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 ||
        !isMinorAmount(item.priceMinor)) {
      throw new Error("请检查商品数量与单价");
    }
    total += item.quantity * item.priceMinor;
    if (!isMinorAmount(total)) throw new Error("订单金额超出支持范围");
  }
  return total;
}

export function orderTotalForEdit(order: SalesOrder, items: OrderItem[], calculated: number): number {
  const pricingUnchanged = items.length === order.items.length && items.every((item) =>
    order.items.some((old) => old.id === item.id && old.quantity === item.quantity &&
      old.priceMinor === item.priceMinor && old.productId === item.productId),
  );
  return pricingUnchanged ? order.totalMinor : calculated;
}

const moneyFormatter = new Intl.NumberFormat("en-MY", {
  style: "currency",
  currency: "MYR",
});

// The catalog still uses major units. Orders pass integer cents through formatMinor.
export function formatMoney(value: number): string {
  return moneyFormatter.format(value);
}

export function minorDecimal(minor: number): string {
  const cents = minor % 100;
  return String((minor - cents) / 100) + "." + String(cents).padStart(2, "0");
}

export function formatMinor(minor: number | bigint): string {
  const amount = BigInt(minor);
  return moneyFormatter.formatToParts(amount / 100n)
    .map((part) => part.type === "fraction" ? String(amount % 100n).padStart(2, "0") : part.value)
    .join("");
}

export const sortLabels = {
  newest: "创建时间 · 最新",
  oldest: "创建时间 · 最早",
  dateDescending: "订单日期 · 最新",
  dateAscending: "订单日期 · 最早",
  totalDescending: "金额 · 从高到低",
  totalAscending: "金额 · 从低到高",
} as const;
export type OrderSort = keyof typeof sortLabels;

export function sortOrders(orders: readonly SalesOrder[], sort: OrderSort): SalesOrder[] {
  const comparisons: Record<OrderSort, (a: SalesOrder, b: SalesOrder) => number> = {
    newest: (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    oldest: (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
    dateDescending: (a, b) => b.date.localeCompare(a.date),
    dateAscending: (a, b) => a.date.localeCompare(b.date),
    totalDescending: (a, b) => b.totalMinor - a.totalMinor,
    totalAscending: (a, b) => a.totalMinor - b.totalMinor,
  };
  return [...orders].sort((a, b) => comparisons[sort](a, b) || a.id.localeCompare(b.id));
}

export function isOrderDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateOrderInput(input: OrderInput): number {
  if (!input.customer.trim() || !isOrderDate(input.date) || !input.items.length) {
    throw new Error("请填写客户、有效订单日期及商品");
  }
  const ids = new Set(input.items.map((item) => item.id));
  if (ids.size !== input.items.length || input.items.some((item) => !item.id || !item.name.trim())) {
    throw new Error("订单商品资料无效");
  }
  return calculateTotal(input.items);
}
