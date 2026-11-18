import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { buildDocument, paginateDocumentRows } from "../src/services/documentModel.ts";
import { buildReports, effectiveSalesTotal, validReportRange } from "../src/services/reportModel.ts";
import { createIndexedCommerceRepository } from "../src/services/commerceRepository.ts";
import { createOrderService } from "../src/services/orderStorage.ts";

const at = "2026-11-18T18:00:00.000Z";
const address = "Suite 10, Fictional Trade Park, Kuala Lumpur";
const line = { id: "line", productId: "p", sku: "DEMO-BOX", name: "Demo carton", priceMinor: 1250, quantity: 3 };

function order(overrides = {}) {
  return {
    id: "ORD-EXAMPLE", customerId: "c", customer: "Fictional Trading",
    customerSnapshot: { billingAddress: address, deliveryAddress: address, email: "buyer@example.test" },
    date: "2026-11-18", remarks: "", createdAt: at, status: "confirmed", items: [line],
    totalMinor: 3750, events: [{ status: "confirmed", at }], ...overrides,
  };
}

function receipt(orderId, amountMinor, date) {
  return { id: orderId + date, orderId, amountMinor, date, method: "transfer", createdAt: at, operationId: orderId + date };
}

function catalog(id, currentStock) {
  return { id, currentStock, lowStockThreshold: 2, sku: id, name: id, priceMinor: 100, active: true, createdAt: at };
}

test("invoice uses frozen customer, SKU, unit and amount snapshots and deterministic numbers", () => {
  const saved = order();
  const doc = buildDocument(saved, [], "invoice");
  assert.equal(doc.number, "INV-ORD-EXAMPLE");
  assert.equal(doc.orderId, saved.id);
  assert.equal(doc.invoiceDate, "2026-11-19");
  assert.equal(doc.address, address);
  assert.equal(doc.lines[0].sku, "DEMO-BOX");
  assert.equal(doc.lines[0].priceMinor, 1250);
  assert.equal(doc.lines[0].amountMinor, 3750);
  assert.equal(doc.subtotalMinor, 3750n);
  assert.equal(doc.totalMinor, 3750);
  assert.equal(doc.discountMinor, undefined);
  assert.equal(doc.taxMinor, undefined);
  assert.equal(buildDocument(JSON.parse(JSON.stringify(saved)), [], "invoice").number, doc.number);
  assert.notEqual(buildDocument(order({ id: "ORD-ANOTHER" }), [], "invoice").number, doc.number);
});

test("catalog and customer edits cannot alter existing stored invoice snapshots", async () => {
  const factory = new IDBFactory();
  const repository = () => createIndexedCommerceRepository(() => factory, () => ({ getItem: () => null }));
  const commerce = createOrderService(repository());
  const product = await commerce.saveProduct({ name: line.name, sku: line.sku, priceMinor: 1250, active: true, lowStockThreshold: 0 }, undefined, 4);
  const { id } = await commerce.createOrder({
    ...order(), items: [{ ...line, productId: product.id }],
  });
  await commerce.updateOrderStatus(id, "confirmed");
  await commerce.saveProduct({ ...product, priceMinor: 5000, sku: "UPDATED", name: "New catalog name" }, product.id);
  const loaded = await repository().read();
  const doc = buildDocument(loaded.orders[0], loaded.payments, "invoice");
  assert.equal(doc.address, address);
  assert.equal(doc.lines[0].name, line.name);
  assert.equal(doc.lines[0].sku, line.sku);
  assert.equal(doc.totalMinor, 3750);
});

test("invoice shows only stored discount, tax, terms, and preserves discrepant legacy totals", () => {
  const doc = buildDocument(order({ totalMinor: 3560, discountMinor: 210, taxMinor: 20, paymentTerms: "Net 14" }), [], "invoice");
  assert.equal(doc.totalMinor, 3560);
  assert.equal(doc.discountMinor, 210);
  assert.equal(doc.taxMinor, 20);
  assert.equal(doc.paymentTerms, "Net 14");
  assert.equal(doc.snapshotDifference, false);
  assert.equal(buildDocument(order({ totalMinor: 3700 }), [], "invoice").snapshotDifference, true);
});

test("invoice balances come from actual receipts, and historical payment remains unverified", () => {
  const saved = order();
  const partial = buildDocument(saved, [receipt(saved.id, 1250, "2026-11-19"), receipt("unrelated", 999, "2026-11-19")], "invoice");
  assert.equal(partial.paidMinor, 1250);
  assert.equal(partial.balanceMinor, 2500);
  assert.equal(partial.paymentStatus, "Partially paid");
  const old = buildDocument(order({ legacyPaymentStatus: "paid", customerSnapshot: undefined }), [], "invoice");
  assert.equal(old.paidMinor, 0);
  assert.equal(old.balanceMinor, undefined);
  assert.match(old.paymentStatus, /review required/);
  assert.equal(old.address, undefined);
});

test("delivery document requires a real shipment event to supply an exact shipment date", () => {
  const notShipped = buildDocument(order(), [], "delivery");
  assert.equal(notShipped.number, "DO-ORD-EXAMPLE");
  assert.equal(notShipped.shipmentDate, undefined);
  assert.equal(notShipped.shipmentNote, "No shipment recorded.");
  const unknown = buildDocument(order({ status: "completed", events: [] }), [], "delivery");
  assert.equal(unknown.shipmentDate, undefined);
  assert.match(unknown.shipmentNote, /Historical/);
  const shipped = buildDocument(order({ status: "shipped", events: [{ status: "shipped", at }] }), [], "delivery");
  assert.equal(shipped.shipmentDate, "2026-11-19");
  assert.match(shipped.shipmentNote, /awaiting signature/);
  assert.equal(shipped.address, address);
});

test("A4 PDF pagination includes every measured row once while reserving the last section", () => {
  const rows = Array.from({ length: 71 }, (_, index) => 23 + (index % 4) * 10);
  const pages = paginateDocumentRows(rows, 660);
  assert.ok(pages.length > 3);
  assert.deepEqual(pages.flat(), rows.map((_, index) => index));
  assert.ok(pages.every((page) => page.reduce((sum, index) => sum + rows[index], 0) <= 660));
  assert.deepEqual(paginateDocumentRows([20, 30], 50), [[0, 1]]);
  assert.deepEqual(paginateDocumentRows([30, 30, 30], 70, 30), [[0, 1], [2]]);
  assert.throws(() => paginateDocumentRows([661], 660), /row exceeds/);
});

function dataFixture() {
  const orders = [
    order({ id: "sale" }),
    order({ id: "other", date: "2026-11-19", items: [{ ...line, productId: "q", name: "Other", quantity: 1 }], totalMinor: 1250 }),
    order({ id: "review", legacyPaymentStatus: "paid", totalMinor: 1000 }),
    order({ id: "voided", status: "cancelled", totalMinor: 9000 }),
    order({ id: "draft", status: "draft", totalMinor: 5000 }),
  ];
  return {
    schemaVersion: 3, orders,
    payments: [receipt("sale", 1250, "2026-11-19"), receipt("other", 500, "2026-11-18")],
    products: [catalog("unknown", 0), catalog("empty", 0), catalog("q", 4)],
    movements: [
      { id: "m", productId: "empty", type: "opening", quantity: 0, previousStock: 0, newStock: 0, createdAt: at },
      { id: "n", productId: "q", type: "opening", quantity: 4, previousStock: 0, newStock: 4, createdAt: at },
    ],
  };
}

test("sales exclude cancelled and draft orders, while status counts show all matching orders", () => {
  const data = dataFixture();
  const report = buildReports(data, { from: "", to: "" });
  assert.equal(report.salesMinor, 6000n);
  assert.equal(effectiveSalesTotal(data.orders), report.salesMinor);
  assert.equal(report.totalOrders, 5);
  assert.equal(report.salesCount, 3);
  assert.equal(report.statuses.find(({ status }) => status === "cancelled").count, 1);
  assert.deepEqual(report.trend.map((entry) => entry.amountMinor), [4750n, 1250n]);
});

test("sales, cash and receivables use distinct inclusive date bases", () => {
  const report = buildReports(dataFixture(), { from: "2026-11-18", to: "2026-11-18" });
  assert.equal(report.salesMinor, 4750n);
  assert.equal(report.collectedMinor, 500n);
  assert.equal(report.balanceMinor, 2500n);
  assert.equal(report.partial, 1);
  assert.equal(report.unpaid, 0);
  assert.equal(report.needsReview, 1);
  assert.equal(report.movements.length, 0);
  assert.equal(buildReports(dataFixture(), { from: "2026-11-19", to: "2026-11-19" }).movements.length, 2);
  assert.equal(validReportRange({ from: "2026-11-19", to: "2026-11-18" }), false);
  assert.equal(validReportRange({ from: "2026-02-30", to: "" }), false);
});

test("top products group sold quantity by snapshotted product identity", () => {
  const report = buildReports(dataFixture(), { from: "", to: "" });
  assert.deepEqual(report.topProducts.map(({ key, quantity, amountMinor }) => [key, quantity, amountMinor]),
    [["id:p", 6n, 7500n], ["id:q", 1n, 1250n]]);
});

test("inventory separates missing historical stock from a tracked zero", () => {
  const report = buildReports(dataFixture(), { from: "2026-01-01", to: "2026-01-01" });
  assert.equal(report.inventory[0].stock, undefined);
  assert.equal(report.inventory[0].low, false);
  assert.equal(report.inventory[1].stock, 0);
  assert.equal(report.inventory[1].status, "缺货");
  assert.equal(report.lowCount, 1);
  assert.equal(report.unknownCount, 1);
  assert.equal(report.movements.length, 0);
});
