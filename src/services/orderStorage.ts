
export type OrderStatus =
  | "draft"
  | "pending"
  | "confirmed"
  | "processing"
  | "completed"
  | "cancelled";

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
}

export interface SalesOrder {
  id: string;
  customer: string;
  date: string;
  items: OrderItem[];
  remarks: string;
  status: OrderStatus;
  total: number;
  createdAt: string;
}

const STORAGE_KEY = "glyphora-oms-demo-orders";

export const statusLabels: Record<OrderStatus, string> = {
  draft: "草稿",
  pending: "待确认",
  confirmed: "已确认",
  processing: "处理中",
  completed: "已完成",
  cancelled: "已取消",
};

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
  }).format(value);
}

export function getOrders(): SalesOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const data: unknown = JSON.parse(raw);

    return Array.isArray(data)
      ? (data as SalesOrder[])
      : [];
  } catch {
    return [];
  }
}

export function saveOrders(orders: SalesOrder[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

export function calculateTotal(items: OrderItem[]): number {
  return Math.round(
    items.reduce(
      (sum, item) => sum + item.quantity * item.price,
      0
    ) * 100
  ) / 100;
}

export function createOrder(
  data: Pick<
    SalesOrder,
    "customer" | "date" | "items" | "remarks" | "status"
  >
): SalesOrder {
  const orders = getOrders();

  const order: SalesOrder = {
    ...data,
    id: `ORD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    total: calculateTotal(data.items),
    createdAt: new Date().toISOString(),
  };

  saveOrders([order, ...orders]);

  return order;
}

export function updateOrderStatus(
  id: string,
  status: OrderStatus
): void {
  const orders = getOrders();

  saveOrders(
    orders.map((order) =>
      order.id === id ? { ...order, status } : order
    )
  );
}
