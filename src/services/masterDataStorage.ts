
export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  createdAt: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  price: number;
  active: boolean;
  createdAt: string;
}

const CUSTOMER_KEY = "glyphora-oms-customers";
const PRODUCT_KEY = "glyphora-oms-products";

function readData<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeData<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// Customers

export function getCustomers(): Customer[] {
  return readData<Customer>(CUSTOMER_KEY);
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

// Products

export function getProducts(): Product[] {
  return readData<Product>(PRODUCT_KEY);
}

export function saveProduct(
  data: Omit<Product, "id" | "createdAt">,
  id?: string
): Product {
  const products = getProducts();

  const duplicate = products.some(
    (p) =>
      p.sku.toLowerCase() === data.sku.toLowerCase() &&
      p.id !== id
  );

  if (duplicate) {
    throw new Error("商品编号 SKU 已存在");
  }

  if (id) {
    const existing = products.find((p) => p.id === id);
    if (!existing) throw new Error("商品不存在");

    const updated: Product = { ...existing, ...data };

    writeData(
      PRODUCT_KEY,
      products.map((p) => (p.id === id ? updated : p))
    );

    return updated;
  }

  const product: Product = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  writeData(PRODUCT_KEY, [product, ...products]);
  return product;
}

export function deleteProduct(id: string): void {
  writeData(
    PRODUCT_KEY,
    getProducts().filter((p) => p.id !== id)
  );
}
