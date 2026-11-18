import { createIndexedCommerceRepository, PRODUCT_SOURCE_KEY, type CommerceRepository } from "./commerceRepository.ts";
import { createOrderService } from "./orderStorage.ts";
import { CUSTOMER_KEY, getCustomers, type Customer } from "./masterDataStorage.ts";
import { LEGACY_ORDER_KEY, ORDER_BACKUP_KEY, ORDER_DATA_KEY } from "./orderRepository.ts";
import { createDemoLifecycle } from "./demoLifecycle.ts";
import { browserRuntime } from "./commerceRules.ts";

const repository = createIndexedCommerceRepository(() => window.indexedDB, () => window.localStorage);
const listeners = new Set<() => void>();
const channel = typeof BroadcastChannel === "function" && typeof window !== "undefined"
  ? new BroadcastChannel("glyphora-oms-commerce")
  : undefined;

function notify() {
  for (const listener of listeners) listener();
}

if (channel) channel.onmessage = notify;

export function subscribeCommerce(listener: () => void) {
  listeners.add(listener);
  // Refresh on focus as well, including browsers without BroadcastChannel.
  window.addEventListener("focus", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("focus", listener);
  };
}

const client: CommerceRepository = {
  read: repository.read,
  async transact(change) {
    const result = await repository.transact(change);
    notify();
    channel?.postMessage("changed");
    return result;
  },
};

export const commerce = createOrderService(client);
const sourceKeys = [CUSTOMER_KEY, PRODUCT_SOURCE_KEY, LEGACY_ORDER_KEY, ORDER_BACKUP_KEY, ORDER_DATA_KEY];
function hasLegacySources() {
  return sourceKeys.some((key) => window.localStorage.getItem(key) !== null);
}

const demo = createDemoLifecycle(client, hasLegacySources);
export const resetDemo = demo.reset;

export async function openWorkspace() {
  const snapshot = await demo.open();
  if (!snapshot.demo) getCustomers();
  return snapshot;
}

export function saveDemoCustomer(fields: Omit<Customer, "id" | "createdAt">, id?: string) {
  return client.transact((data) => {
    if (!data.demo) throw new Error("演示工作区不可用");
    const name = fields.name.trim();
    if (!name) throw new Error("请输入客户名称");
    const before = data.demo.customers.find((customer) => customer.id === id);
    if (id && !before) throw new Error("客户不存在");
    const customer: Customer = {
      ...fields, name, id: before?.id ?? browserRuntime.id(), createdAt: before?.createdAt ?? browserRuntime.now(),
    };
    data.demo.customers = before
      ? data.demo.customers.map((entry) => entry.id === id ? customer : entry)
      : [customer, ...data.demo.customers];
  });
}

export function deleteDemoCustomer(id: string) {
  return client.transact((data) => {
    if (!data.demo) throw new Error("演示工作区不可用");
    data.demo.customers = data.demo.customers.filter((customer) => customer.id !== id);
  });
}
