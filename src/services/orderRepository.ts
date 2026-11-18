import {
  ORDER_SCHEMA_VERSION,
  calculateTotal,
  isMinorAmount,
  isOrderDate,
  isPaymentStatus,
  parseMinor,
  statusLabels,
  type LegacyOrderStatus,
  type OrderData,
  type OrderEvent,
  type OrderItem,
  type SalesOrder,
} from "./orderModel.ts";

export const LEGACY_ORDER_KEY = "glyphora-oms-demo-orders";
export const ORDER_DATA_KEY = "glyphora-oms-orders-v2";
export const ORDER_BACKUP_KEY = "glyphora-oms-orders-v1-backup";

export class OrderDataError extends Error {}

type RecordValue = Record<string, unknown>;
function record(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalText(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function instant(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function currentStatus(value: unknown): value is SalesOrder["status"] {
  return typeof value === "string" && Object.hasOwn(statusLabels, value);
}

function legacyStatus(value: unknown): value is LegacyOrderStatus {
  return value === "pending" || (currentStatus(value) && value !== "shipped");
}

function optionalPayment(value: unknown): boolean {
  return value === undefined || isPaymentStatus(value);
}

function uniqueIds(items: readonly { id: string }[]): boolean {
  return items.length === new Set(items.map((item) => item.id)).size;
}

function validItem(value: unknown): value is RecordValue & { id: string } {
  return record(value) && text(value.id) && text(value.name) && optionalText(value.productId) &&
    typeof value.quantity === "number" && Number.isSafeInteger(value.quantity) && value.quantity > 0;
}

function validOrderFields(value: unknown): value is RecordValue {
  return record(value) && text(value.id) && text(value.customer) && optionalText(value.customerId) &&
    isOrderDate(value.date) && instant(value.createdAt) && typeof value.remarks === "string" &&
    optionalText(value.cancellationReason) && Array.isArray(value.items) && value.items.length > 0 &&
    value.items.every(validItem) && uniqueIds(value.items);
}

function validEvent(value: unknown): value is OrderEvent {
  return record(value) && currentStatus(value.status) && instant(value.at) &&
    optionalText(value.cancellationReason);
}

function validOrder(value: unknown): value is SalesOrder {
  return validOrderFields(value) && isMinorAmount(value.totalMinor) && currentStatus(value.status) &&
    optionalPayment(value.demoPaymentStatus) && (value.submittedAt === undefined || instant(value.submittedAt)) &&
    Array.isArray(value.events) && value.events.every(validEvent) &&
    (!value.events.length || value.events.at(-1)?.status === value.status) &&
    (value.legacy === undefined || (record(value.legacy) && legacyStatus(value.legacy.status) &&
      optionalPayment(value.legacy.paymentStatus)));
}

export function decodeOrderData(raw: string): OrderData {
  const result: unknown = JSON.parse(raw);
  if (!record(result) || result.schemaVersion !== ORDER_SCHEMA_VERSION) {
    throw new Error("不支持的订单数据版本");
  }
  if (!Array.isArray(result.orders) || !result.orders.every(validOrder) || !uniqueIds(result.orders)) {
    throw new Error("订单记录格式无效");
  }
  for (const order of result.orders) calculateTotal(order.items);
  return { schemaVersion: ORDER_SCHEMA_VERSION, orders: result.orders };
}

function legacyMoney(value: unknown): number {
  if (typeof value !== "number") throw new Error("旧订单金额无效");
  return parseMinor(String(value));
}

function migrateOrder(value: unknown): SalesOrder {
  if (!validOrderFields(value) || !legacyStatus(value.status) || !optionalPayment(value.paymentStatus)) {
    throw new Error("旧订单记录格式无效");
  }

  const items: OrderItem[] = (value.items as RecordValue[]).map((item) => ({
    id: item.id as string,
    productId: item.productId as string | undefined,
    name: item.name as string,
    quantity: item.quantity as number,
    priceMinor: legacyMoney(item.price),
  }));
  return {
    id: value.id as string,
    customer: value.customer as string,
    customerId: value.customerId as string | undefined,
    date: value.date as string,
    items,
    remarks: value.remarks as string,
    status: value.status === "pending" ? "draft" : value.status,
    totalMinor: legacyMoney(value.total),
    createdAt: value.createdAt as string,
    cancellationReason: value.cancellationReason as string | undefined,
    events: [],
    legacy: { status: value.status, paymentStatus: value.paymentStatus as SalesOrder["demoPaymentStatus"] },
  };
}

export function migrateV1Orders(raw: string): OrderData {
  const source: unknown = JSON.parse(raw);
  if (!Array.isArray(source)) throw new Error("旧订单数据不是列表");
  return decodeOrderData(JSON.stringify({
    schemaVersion: ORDER_SCHEMA_VERSION,
    orders: source.map(migrateOrder),
  }));
}
