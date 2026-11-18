
export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  createdAt: string;
}

export const CUSTOMER_KEY = "glyphora-oms-customers";

function readData<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Invalid customer directory");
    return parsed as T[];
  } catch {
    throw new Error("无法读取客户资料，原始数据已保留。");
  }
}

function writeData<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// Customers

export function getCustomers(): Customer[] {
  const customers = readData<Customer>(CUSTOMER_KEY);
  if (customers.some((entry) => !entry || [entry.id, entry.name, entry.phone, entry.email, entry.address, entry.createdAt]
    .some((field) => typeof field !== "string"))) {
    throw new Error("客户资料格式无效，原始数据已保留。");
  }
  return customers;
}

export function saveCustomer(
  data: Omit<Customer, "id" | "createdAt">,
  id?: string
): Customer {
  const customers = getCustomers();

  if (id) {
    const existing = customers.find((c) => c.id === id);
    if (!existing) throw new Error("客户不存在");

    const updated: Customer = { ...existing, ...data };

    writeData(
      CUSTOMER_KEY,
      customers.map((c) => (c.id === id ? updated : c))
    );

    return updated;
  }

  const customer: Customer = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  writeData(CUSTOMER_KEY, [customer, ...customers]);
  return customer;
}

export function deleteCustomer(id: string): void {
  writeData(
    CUSTOMER_KEY,
    getCustomers().filter((c) => c.id !== id)
  );
}
