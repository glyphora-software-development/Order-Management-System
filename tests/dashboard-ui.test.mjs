import assert from "node:assert/strict";
import test from "node:test";
import { dashboardOverview } from "../src/services/dashboardOverview.ts";
import { paginate } from "../src/components/listPage.ts";

const createdAt = "2026-11-18T00:00:00.000Z";

function order(id, status, totalMinor, extra = {}) {
  return { id, status, totalMinor, createdAt, date: "2026-11-18", customer: id, items: [], events: [], ...extra };
}

test("dashboard KPIs follow report rules, and historical flags are not receipt records", () => {
  const data = {
    schemaVersion: 3,
    orders: [
      order("pending", "draft", 1000, { submittedAt: createdAt }),
      order("cancelled", "cancelled", 9000),
      order("active", "shipped", 2500),
      order("historic", "confirmed", 5000, { legacyPaymentStatus: "paid" }),
    ],
    products: [], movements: [],
    payments: [{ id: "payment-1", orderId: "active", amountMinor: 1000, date: "2026-11-18", createdAt }],
  };
  const view = dashboardOverview(data);
  assert.equal(view.pending, 1);
  assert.equal(view.report.salesMinor, 7500n);
  assert.equal(view.report.collectedMinor, 1000n);
  assert.equal(view.report.balanceMinor, 1500n);
  assert.equal(view.report.needsReview, 1);
  assert.deepEqual(view.attention.map(({ label }) => label), ["历史付款待核对", "待确认", "已发货 · 待收款"]);
});

test("dashboard low stock and recent records use known stock and deterministic sort limits", () => {
  const products = ["low", "unknown", "empty"].map((id) => ({
    id, sku: id, name: id, currentStock: id === "low" ? 2 : 0, lowStockThreshold: 2,
  }));
  const view = dashboardOverview({
    schemaVersion: 3,
    orders: Array.from({ length: 9 }, (_, index) => order("ord-" + index, "draft", 100, {
      createdAt: "2026-11-" + String(10 + index) + "T00:00:00.000Z",
    })),
    products,
    payments: [],
    movements: ["low", "empty"].map((productId) => ({ productId, createdAt })),
  });
  assert.equal(view.recentOrders.length, 6);
  assert.equal(view.recentOrders[0].id, "ord-8");
  assert.equal(view.report.lowCount, 2);
  assert.deepEqual(view.lowStock.map(({ product }) => product.id), ["empty", "low"]);
  assert.equal(view.report.unknownCount, 1);
});

test("pagination limits records and clamps after deletion or filtering", () => {
  const items = Array.from({ length: 25 }, (_, index) => index + 1);
  assert.deepEqual(paginate(items, 2), { current: 2, pages: 3, rows: items.slice(12, 24) });
  assert.deepEqual(paginate(items.slice(0, 13), 3), { current: 2, pages: 2, rows: [13] });
  assert.deepEqual(paginate([], 4), { current: 1, pages: 1, rows: [] });
});
