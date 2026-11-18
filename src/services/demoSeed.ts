import { COMMERCE_SCHEMA_VERSION, type CommerceData, type PaymentInput } from "./commerceModel.ts";
import type { Customer } from "./masterDataStorage.ts";
import { createOrderService } from "./orderStorage.ts";
import type { BusinessRuntime } from "./commerceRules.ts";

export const DEMO_VERSION = 1;

const companies = [
  "Meridian Trade Demo", "Cedar Bay Retail Demo", "Orchid Wholesale Demo",
  "Northbridge Supply Demo", "Harbor Office Demo", "Atlas Pack Demo",
  "Riverstone Retail Demo", "Banyan Trading Demo", "Beacon Supply Demo",
  "Juniper Market Demo", "Cobalt Logistics Demo", "Willow Store Demo",
];

const catalog = [
  ["BOX-100", "Corrugated carton · 瓦楞纸箱", 1250],
  ["BOX-120", "Double-wall carton", 1880],
  ["BOX-150", "Flat mailer box", 720],
  ["BAG-210", "Kraft dispatch bag", 350],
  ["BAG-240", "Reusable packing sleeve", 510],
  ["TAP-310", "Packing tape roll · 封箱胶带", 680],
  ["TAP-320", "Reinforced packing tape", 990],
  ["LAB-410", "Shipping label roll", 1450],
  ["LAB-420", "Fragile label pack", 580],
  ["FIL-510", "Recycled paper fill", 1130],
  ["FIL-520", "Honeycomb paper roll", 2640],
  ["WRP-610", "Clear pallet wrap", 3180],
  ["WRP-620", "Hand stretch film", 2440],
  ["ENV-710", "A4 dispatch envelope", 250],
  ["ENV-720", "Padded courier envelope", 420],
  ["TAG-810", "Cable tie tag pack", 880],
  ["TAG-820", "Stock control tag pad", 640],
  ["LAB-430", "Inventory label pack", 1250],
  ["WRP-630", "Corner protection strip", 1240],
  ["ENV-730", "Water-resistant pouch", 540],
] as const;

const methods: PaymentInput["method"][] = ["transfer", "card", "cash"];

export async function buildDemoSeed(): Promise<CommerceData> {
  let time = Date.UTC(2026, 9, 1, 1);
  let sequence = 0;
  const runtime: BusinessRuntime = {
    now: () => new Date(time += 60_000).toISOString(),
    id: () => (++sequence).toString(16).padStart(8, "0") + "-d300-4000-8000-000000000000",
  };
  const customers: Customer[] = companies.map((name, index) => ({
    id: runtime.id(), name, phone: "", email: "buyer" + (index + 1) + "@glyphora.example",
    address: "Demo unit " + (101 + index) + ", Fictional Commerce Park, Kuala Lumpur",
    createdAt: runtime.now(),
  }));

  const seed: CommerceData = {
    schemaVersion: COMMERCE_SCHEMA_VERSION, orders: [], products: [], payments: [], movements: [],
    demo: { version: DEMO_VERSION, generation: 1, customers },
  };
  const commerce = createOrderService({
    read: async () => seed,
    transact: async (change) => change(seed),
  }, runtime);

  for (const [index, [sku, name, priceMinor]] of catalog.entries()) {
    const stock = index < 16 ? 95 + index * 3 : [4, 0, 2, 6][index - 16];
    const product = await commerce.saveProduct({
      sku, name, priceMinor, active: true, lowStockThreshold: index < 16 ? 12 : 8,
    }, undefined, stock);
    if (index === 2 || index === 7 || index === 11) {
      await commerce.adjustStock(product.id, 15, "DEMO-RESTOCK-" + sku);
    }
  }

  const products = [...seed.products].reverse();
  for (let index = 0; index < 32; index++) {
    const at = new Date(Date.UTC(2026, 9, 17 + index, 2));
    const date = at.toISOString().slice(0, 10);
    time = at.getTime();
    const customer = customers[index % customers.length];
    const items = Array.from({ length: 2 + (index % 3 === 0 ? 1 : 0) }, (_, line) => {
      const item = products[(index * 5 + line * 3) % 16];
      return { id: runtime.id(), productId: item.id, sku: item.sku, name: item.name,
        priceMinor: item.priceMinor, quantity: 2 + ((index + line * 2) % 7) };
    });
    const state = index % 8;
    const order = await commerce.createOrder({
      customer: customer.name, customerId: customer.id,
      customerSnapshot: { email: customer.email, billingAddress: customer.address, deliveryAddress: customer.address },
      date, remarks: "Fictional portfolio demonstration order.", items,
    }, state !== 0 || index % 16 !== 0);
    if (state === 0) continue;
    await commerce.updateOrderStatus(order.id, "confirmed");
    if (state === 7) {
      await commerce.updateOrderStatus(order.id, "cancelled", "Demo customer cancelled before dispatch.");
      continue;
    }
    if (state >= 3) await commerce.updateOrderStatus(order.id, "processing");
    if (state >= 4) await commerce.updateOrderStatus(order.id, "shipped");
    if (state >= 2) {
      const method = methods[index % methods.length];
      const amountMinor = state >= 5 ? order.totalMinor : Math.floor(order.totalMinor * (state + 1) / 10);
      await commerce.recordPayment(order.id, {
        amountMinor, date, method, reference: "DEMO-RECEIPT-" + (index + 1),
      }, "DEMO-PAY-" + (index + 1));
    }
    if (state === 6) await commerce.updateOrderStatus(order.id, "completed");
  }

  return seed;
}
