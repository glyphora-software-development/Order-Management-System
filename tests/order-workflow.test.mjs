import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { createOrderService } from "../src/services/orderStorage.ts";
import { createIndexedCommerceRepository, COMMERCE_STORE, PRODUCT_SOURCE_KEY } from "../src/services/commerceRepository.ts";
import { LEGACY_ORDER_KEY, ORDER_BACKUP_KEY, ORDER_DATA_KEY } from "../src/services/orderRepository.ts";
import { calculateTotal, formatMinor, isSubmitted, parseMinor, sortOrders } from "../src/services/orderModel.ts";
import { needsPaymentReview, paymentSummary, stockForOrder } from "../src/services/commerceModel.ts";

function fixture(entries = []) {
  const factory = new IDBFactory();
  const values = new Map(entries);
  const storage = () => ({ getItem: (key) => values.get(key) ?? null });
  const connect = () => createIndexedCommerceRepository(() => factory, storage);
  const repository = connect();
  return { values, factory, repository, connect, orders: createOrderService(repository) };
}

async function product(orders, stock = 10, sku = "ABC") {
  return orders.saveProduct({ sku, name: "Carton " + sku, priceMinor: 1250, active: true, lowStockThreshold: 2 },
    undefined, stock);
}

function input(...products) {
  return {
    customer: "Demo Trading", customerId: "customer-01", date: "2026-11-18", remarks: "",
    items: products.map((entry, index) => ({
      id: "line-" + index, productId: entry.id, name: entry.name, quantity: 3, priceMinor: entry.priceMinor,
    })),
  };
}

function payment(amountMinor, reference) {
  return { amountMinor, method: "transfer", date: "2026-11-18", reference };
}

function oldV1(overrides = {}) {
  return {
    id: "ORD-LEGACY", customer: "Demo Trading", date: "2026-11-17", remarks: "Historic",
    items: [{ id: "line-01", name: "Carton", quantity: 3, price: 12.51 }],
    total: 37.54, createdAt: "2026-11-17T09:00:00.000Z", status: "pending",
    paymentStatus: "partial", ...overrides,
  };
}

function oldV2(overrides = {}) {
  return {
    id: "ORD-V2", customer: "Demo Trading", date: "2026-11-17", remarks: "V2",
    items: [{ id: "line-01", name: "Carton", quantity: 3, priceMinor: 1251 }],
    totalMinor: 3754, createdAt: "2026-11-17T09:00:00.000Z", status: "shipped", events: [],
    demoPaymentStatus: "paid", ...overrides,
  };
}

function v2(...orders) {
  return JSON.stringify({ schemaVersion: 2, orders });
}

async function setup(stock = 10) {
  const f = fixture();
  const item = await product(f.orders, stock);
  const order = await f.orders.createOrder(input(item), true);
  return { ...f, item, order };
}

const movementsOf = (snapshot, type) => snapshot.movements.filter((entry) => entry.type === type);

test("confirmation atomically records the stock deduction and timeline", async () => {
  const { orders, order } = await setup();
  assert.equal((await orders.read()).products[0].currentStock, 10);
  await orders.updateOrderStatus(order.id, "confirmed");
  const snapshot = await orders.read();
  assert.equal(snapshot.products[0].currentStock, 7);
  assert.equal(snapshot.orders[0].events.at(-1).status, "confirmed");
  assert.equal(snapshot.schemaVersion, 3);
  assert.deepEqual(movementsOf(snapshot, "deduction").map(({ orderId, previousStock, newStock, quantity }) =>
    [orderId, previousStock, newStock, quantity]), [[order.id, 10, 7, -3]]);
});

test("insufficient stock leaves the order and inventory unchanged", async () => {
  const { orders, order } = await setup(2);
  const before = await orders.read();
  await assert.rejects(orders.updateOrderStatus(order.id, "confirmed"), /库存不足.*现有 2.*需要 3/);
  assert.deepEqual(await orders.read(), before);
});

test("duplicate confirmation cannot deduct stock twice", async () => {
  const { orders, order } = await setup();
  await orders.updateOrderStatus(order.id, "confirmed");
  await assert.rejects(orders.updateOrderStatus(order.id, "confirmed"));
  assert.equal(movementsOf(await orders.read(), "deduction").length, 1);
});

test("multiple products and duplicate lines are combined in the confirmation transaction", async () => {
  const { orders, item } = await setup();
  const second = await product(orders, 2, "DEF");
  const order = await orders.createOrder(input(item, second, item));
  const before = await orders.read();
  await assert.rejects(orders.updateOrderStatus(order.id, "confirmed"), /库存不足/);
  assert.deepEqual(await orders.read(), before);
  await orders.adjustStock(second.id, 5, "receive-extra");
  await orders.updateOrderStatus(order.id, "confirmed");
  const snapshot = await orders.read();
  assert.deepEqual(snapshot.products.map((entry) => entry.currentStock), [4, 4]);
  assert.deepEqual(movementsOf(snapshot, "deduction").map((entry) => entry.quantity).sort(), [-3, -6].sort());
});

test("a failed IndexedDB write rolls back orders and inventory in the document", async () => {
  const { orders, repository } = await setup();
  const before = await orders.read();
  await assert.rejects(repository.transact((draft) => {
    draft.orders[0].status = "confirmed";
    draft.products[0].currentStock = 0;
    draft.invalidField = () => {};
  }), /could not be cloned|clone/i);
  assert.deepEqual(await orders.read(), before);
});

test("processing and shipping do not deduct again, and shipped orders cannot cancel", async () => {
  const { orders, order } = await setup();
  for (const status of ["confirmed", "processing", "shipped"]) await orders.updateOrderStatus(order.id, status);
  await assert.rejects(orders.updateOrderStatus(order.id, "cancelled", "Too late"));
  const snapshot = await orders.read();
  assert.equal(snapshot.products[0].currentStock, 7);
  assert.equal(movementsOf(snapshot, "deduction").length, 1);
  assert.equal(movementsOf(snapshot, "restoration").length, 0);
});

test("cancellation requires a reason, restores only its deductions, and cannot replay", async () => {
  const { orders, order } = await setup();
  await orders.updateOrderStatus(order.id, "confirmed");
  await assert.rejects(orders.updateOrderStatus(order.id, "cancelled", " "), /取消原因/);
  await orders.updateOrderStatus(order.id, "cancelled", " Customer request ");
  await assert.rejects(orders.updateOrderStatus(order.id, "cancelled", "Replay"));
  await assert.rejects(orders.updateOrder(order.id, input()), /锁定/);
  const snapshot = await orders.read();
  assert.equal(snapshot.products[0].currentStock, 10);
  assert.equal(movementsOf(snapshot, "restoration").length, 1);
  assert.equal(snapshot.orders[0].events.at(-1).cancellationReason, "Customer request");
});

test("partial and full payments derive status and balance, and gate completion", async () => {
  const { orders, order } = await setup();
  await orders.updateOrderStatus(order.id, "confirmed");
  await orders.recordPayment(order.id, payment(1500, "BANK-1"), "pay-1");
  let snapshot = await orders.read();
  assert.deepEqual(paymentSummary(order, snapshot.payments), { paid: 1500, remaining: 2250, status: "partial" });
  await assert.rejects(orders.updateOrderStatus(order.id, "cancelled", "Refund required"), /付款/);
  await orders.updateOrderStatus(order.id, "processing");
  await orders.updateOrderStatus(order.id, "shipped");
  await assert.rejects(orders.updateOrderStatus(order.id, "completed"), /结清/);
  await orders.recordPayment(order.id, payment(2250), "pay-2");
  snapshot = await orders.read();
  assert.deepEqual(paymentSummary(order, snapshot.payments), { paid: 3750, remaining: 0, status: "paid" });
  assert.equal(snapshot.payments[1].reference, "BANK-1");
  await orders.updateOrderStatus(order.id, "completed");
  assert.deepEqual((await orders.read()).orders[0].events.map((event) => event.status),
    ["draft", "confirmed", "processing", "shipped", "completed"]);
});

test("nonpositive, invalid, and excessive payments are rejected without writes", async () => {
  const { orders, order } = await setup();
  await orders.updateOrderStatus(order.id, "confirmed");
  const before = await orders.read();
  for (const amount of [0, -10, 0.5, 3751]) {
    await assert.rejects(orders.recordPayment(order.id, payment(amount), "bad-" + amount));
  }
  await assert.rejects(orders.recordPayment(order.id, { ...payment(1), date: "2026-02-30" }, "date"));
  assert.deepEqual(await orders.read(), before);
});

test("replaying the same payment Operation ID returns the same receipt without another credit", async () => {
  const { orders, order } = await setup();
  await orders.updateOrderStatus(order.id, "confirmed");
  const original = await orders.recordPayment(order.id, payment(1000, "ONE"), "retry");
  assert.deepEqual(await orders.recordPayment(order.id, payment(1000, "ONE"), "retry"), original);
  await assert.rejects(orders.recordPayment(order.id, payment(2000), "retry"), /操作编号/);
  assert.equal((await orders.read()).payments.length, 1);
});

test("separate IndexedDB connections serialize stock and payment conflicts", async () => {
  const { orders, connect, item, order } = await setup(5);
  const secondService = createOrderService(connect());
  const rival = await secondService.createOrder(input(item));
  const confirmations = await Promise.allSettled([
    orders.updateOrderStatus(order.id, "confirmed"),
    secondService.updateOrderStatus(rival.id, "confirmed"),
  ]);
  assert.equal(confirmations.filter((result) => result.status === "fulfilled").length, 1);
  let snapshot = await orders.read();
  assert.equal(snapshot.products[0].currentStock, 2);
  const winner = snapshot.orders.find((entry) => entry.status === "confirmed");
  const receipts = await Promise.allSettled([
    orders.recordPayment(winner.id, payment(3000), "tab-1"),
    secondService.recordPayment(winner.id, payment(3000), "tab-2"),
  ]);
  assert.equal(receipts.filter((result) => result.status === "fulfilled").length, 1);
  snapshot = await secondService.read();
  assert.equal(snapshot.payments.length, 1);
  assert.equal(paymentSummary(winner, snapshot.payments).remaining, 750);
});

test("same payment operation from two connections posts a single receipt", async () => {
  const { orders, connect, order } = await setup();
  const other = createOrderService(connect());
  await orders.updateOrderStatus(order.id, "confirmed");
  const receipts = await Promise.all([
    orders.recordPayment(order.id, payment(1000), "same-operation"),
    other.recordPayment(order.id, payment(1000), "same-operation"),
  ]);
  assert.equal(receipts[0].id, receipts[1].id);
  assert.equal((await orders.read()).payments.length, 1);
});

function rawBackup(factory) {
  return new Promise((resolve, reject) => {
    const request = factory.open("glyphora-oms-commerce", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(COMMERCE_STORE);
      const read = transaction.objectStore(COMMERCE_STORE).get("migration-backup");
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(read.error);
      transaction.oncomplete = () => db.close();
    };
  });
}

test("backs up the source bytes, migrates V2 and V1 provenance once and preserves snapshots", async () => {
  const raw = v2(
    oldV2({ status: "completed" }),
    oldV2({ id: "ORD-PENDING", status: "draft", legacy: { status: "pending", paymentStatus: "partial" } }),
  );
  const products = JSON.stringify([{ id: "p-1", name: "Carton", sku: "LEG", price: 12.51,
    createdAt: "2026-11-17T00:00:00.000Z", active: true }]);
  const f = fixture([[ORDER_DATA_KEY, raw], [PRODUCT_SOURCE_KEY, products]]);
  const [read, repeated] = await Promise.all([f.orders.read(), f.connect().read()]);
  assert.deepEqual(read, repeated);
  assert.equal(f.values.get(ORDER_DATA_KEY), raw);
  assert.equal((await rawBackup(f.factory)).v2Orders, raw);
  assert.equal((await rawBackup(f.factory)).products, products);
  assert.equal(read.products[0].priceMinor, 1251);
  assert.equal(read.products[0].currentStock, 0);
  assert.equal(read.orders[0].status, "completed");
  assert.equal(read.orders[0].totalMinor, 3754);
  assert.equal(read.orders[0].items[0].productId, undefined);
  assert.equal(read.orders[0].legacyPaymentStatus, "paid");
  assert.equal(isSubmitted(read.orders[1]), true);
  assert.equal(read.orders[1].legacy.paymentStatus, "partial");
  assert.deepEqual(read.payments, []);
  assert.deepEqual(read.movements, []);
  assert.deepEqual(read.orders[0].events, []);
});

test("migrates V1 directly, retains mismatched legacy totals and rejects broken sources", async () => {
  const raw = JSON.stringify([oldV1()]);
  const f = fixture([[LEGACY_ORDER_KEY, raw], [ORDER_BACKUP_KEY, raw]]);
  const [legacy] = (await f.orders.read()).orders;
  assert.equal(legacy.status, "draft");
  assert.equal(legacy.legacy.status, "pending");
  assert.equal(legacy.totalMinor, 3754);
  await f.orders.updateOrder(legacy.id, { ...legacy, remarks: "Edited note" });
  assert.equal((await f.orders.read()).orders[0].totalMinor, 3754);
  await assert.rejects(f.orders.updateOrderStatus(legacy.id, "confirmed"), /缺少关联/);
  const corrupt = fixture([[ORDER_DATA_KEY, "{bad"]]);
  await assert.rejects(corrupt.orders.read(), /旧资料已保留/);
  await assert.rejects(corrupt.connect().read(), /旧资料已保留/);
  assert.equal(corrupt.values.get(ORDER_DATA_KEY), "{bad");
  assert.equal((await rawBackup(corrupt.factory)).v2Orders, "{bad");
});

test("old payment flags block posting and completion until recorded evidence is reviewed", async () => {
  const { orders } = fixture([[ORDER_DATA_KEY, v2(oldV2())]]);
  const id = "ORD-V2";
  await assert.rejects(orders.recordPayment(id, payment(1000), "unreviewed"), /核对/);
  await assert.rejects(orders.updateOrderStatus(id, "completed"), /核对/);
  await assert.rejects(orders.reconcilePayment(id, "Evidence", "verify", payment(5000)), /超过/);
  assert.equal(needsPaymentReview((await orders.read()).orders[0]), true);
  await orders.reconcilePayment(id, "Verified bank receipt", "verify", payment(3754, "BANK-V1"));
  await orders.reconcilePayment(id, "Verified bank receipt", "verify", payment(3754, "BANK-V1"));
  await orders.updateOrderStatus(id, "completed");
  const snapshot = await orders.read();
  assert.equal(snapshot.payments.length, 1);
  assert.equal(snapshot.orders[0].paymentReview.note, "Verified bank receipt");
  assert.equal(snapshot.orders[0].legacyPaymentStatus, "paid");
});

test("legacy confirmed orders without deductions never restore fictitious inventory", async () => {
  const { orders } = fixture([[ORDER_DATA_KEY, v2(oldV2({ status: "confirmed", demoPaymentStatus: "unpaid" }))]]);
  await orders.reconcilePayment("ORD-V2", "Verified no receipt", "zero");
  await orders.updateOrderStatus("ORD-V2", "cancelled", "Legacy cancellation");
  const snapshot = await orders.read();
  assert.deepEqual(snapshot.movements, []);
  assert.equal(stockForOrder(snapshot.orders[0], snapshot.movements), "无扣减记录");
});

test("catalog opening stock and archival preserve product inventory history", async () => {
  const { orders, item, order } = await setup(3);
  await orders.updateOrderStatus(order.id, "confirmed");
  await assert.rejects(orders.deleteProduct(item.id), /待履约/);
  await orders.updateOrderStatus(order.id, "processing");
  await orders.updateOrderStatus(order.id, "shipped");
  await orders.deleteProduct(item.id);
  const snapshot = await orders.read();
  assert.equal(snapshot.products[0].archived, true);
  assert.equal(snapshot.movements.length, 2);
  assert.ok(snapshot.movements.every((movement) => movement.productId === item.id));
});

test("inventory history is continuous and manual adjustment retries are safe", async () => {
  const { orders, order, item } = await setup();
  await orders.adjustStock(item.id, 2, "manual");
  await orders.adjustStock(item.id, 2, "manual");
  await assert.rejects(orders.adjustStock(item.id, -50, "invalid"), /库存不足/);
  await orders.updateOrderStatus(order.id, "confirmed");
  await orders.updateOrderStatus(order.id, "cancelled", "Cancelled");
  const snapshot = await orders.read();
  const history = [...snapshot.movements].reverse();
  assert.deepEqual(history.map(({ type, previousStock, newStock }) => [type, previousStock, newStock]),
    [["opening", 0, 10], ["adjustment", 10, 12], ["deduction", 12, 9], ["restoration", 9, 12]]);
  assert.equal(snapshot.products[0].currentStock, 12);
});

test("Phase 1 validation, sorting, draft edit and historical price snapshots still work", async () => {
  const { orders, item, order } = await setup();
  assert.match(order.id, /^ORD-[A-F0-9]{8}$/);
  assert.equal(isSubmitted(order), true);
  assert.equal(parseMinor("0.29"), 29);
  assert.equal(calculateTotal([{ quantity: 3, priceMinor: 29 }, { quantity: 2, priceMinor: 10 }]), 107);
  assert.match(formatMinor(Number.MAX_SAFE_INTEGER), /\.91$/);
  assert.throws(() => parseMinor("0.001"));
  await assert.rejects(orders.updateOrderStatus(order.id, "shipped"));
  await orders.updateOrder(order.id, { ...input(item), remarks: "Edit", status: "completed" });
  const replay = await orders.createOrder(input(item), true, "create-id");
  assert.equal((await orders.createOrder(input(item), true, "create-id")).id, replay.id);
  const cheaperInput = { ...input(item), date: "2026-11-16" };
  cheaperInput.items[0].priceMinor = 500;
  const cheaper = await orders.createOrder(cheaperInput);
  await orders.saveProduct({ ...item, priceMinor: 5000 }, item.id);
  const snapshot = await orders.read();
  assert.equal(snapshot.orders.find((entry) => entry.id === order.id).status, "draft");
  assert.equal(snapshot.orders.find((entry) => entry.id === order.id).items[0].priceMinor, 1250);
  assert.equal(sortOrders(snapshot.orders, "totalAscending")[0].id, cheaper.id);
  assert.equal(sortOrders(snapshot.orders, "dateAscending")[0].id, cheaper.id);
});
