import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { buildDemoSeed } from "../src/services/demoSeed.ts";
import { createDemoLifecycle } from "../src/services/demoLifecycle.ts";
import { createIndexedCommerceRepository, COMMERCE_STORE } from "../src/services/commerceRepository.ts";
import { ORDER_DATA_KEY } from "../src/services/orderRepository.ts";
import { CUSTOMER_KEY } from "../src/services/masterDataStorage.ts";
import { buildReports } from "../src/services/reportModel.ts";
import { paymentSummary } from "../src/services/commerceModel.ts";

function fixture(values = new Map()) {
  const factory = new IDBFactory();
  const connect = () => createIndexedCommerceRepository(() => factory, () => ({ getItem: (key) => values.get(key) ?? null }));
  const repo = connect();
  const hasLegacy = () => values.has(CUSTOMER_KEY) || values.has(ORDER_DATA_KEY);
  return { repo, factory, connect, values, hasLegacy, demo: createDemoLifecycle(repo, hasLegacy) };
}

function backup(factory) {
  return new Promise((resolve, reject) => {
    const request = factory.open("glyphora-oms-commerce", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(COMMERCE_STORE);
      const read = transaction.objectStore(COMMERCE_STORE).get("migration-backup");
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(read.error);
      transaction.oncomplete = () => database.close();
    };
  });
}

test("seed is deterministic and coherent across orders, payments and stock ledgers", async () => {
  const seed = await buildDemoSeed();
  assert.deepEqual(seed, await buildDemoSeed());
  assert.equal(seed.demo.customers.length, 12);
  assert.equal(seed.products.length, 20);
  assert.equal(seed.orders.length, 32);
  assert.equal(seed.payments.length, 20);
  assert.equal(new Set(seed.orders.map((order) => order.id)).size, seed.orders.length);
  assert.equal(new Set(seed.payments.map((payment) => payment.operationId)).size, seed.payments.length);
  const report = buildReports(seed, { from: "", to: "" });
  assert.deepEqual(report.statuses.map(({ count }) => count), [4, 8, 4, 8, 4, 4]);
  assert.equal(report.lowCount, 4);
  assert.equal(report.needsReview, 0);
  assert.ok(report.trend.length > 15);
  for (const order of seed.orders) {
    const { paid, remaining } = paymentSummary(order, seed.payments);
    assert.ok(paid >= 0 && remaining >= 0);
    assert.equal(order.events.at(-1).status, order.status);
    assert.ok(seed.demo.customers.some((entry) => entry.id === order.customerId));
    if (order.status === "completed") assert.ok(paid > 0 && remaining === 0);
    if (order.status === "draft" || order.status === "cancelled") assert.equal(paid, 0);
  }
  for (const product of seed.products) {
    let current = 0;
    for (const movement of [...seed.movements].reverse().filter((entry) => entry.productId === product.id)) {
      assert.equal(movement.previousStock, current);
      assert.equal(movement.newStock, current + movement.quantity);
      current = movement.newStock;
      assert.ok(current >= 0);
    }
    assert.equal(current, product.currentStock);
  }
});

test("first open from two connections seeds only once and repeated opens preserve edits", async () => {
  const { demo, repo, connect, hasLegacy } = fixture();
  await Promise.all([demo.open(), createDemoLifecycle(connect(), hasLegacy).open()]);
  assert.equal((await repo.read()).orders.length, 32);
  await repo.transact((data) => { data.demo.customers[0].name = "Demo visitor edit"; });
  assert.equal((await demo.open()).demo.customers[0].name, "Demo visitor edit");
});

test("reset replaces only demo data atomically, with stable records and preserved backups", async () => {
  const { demo, repo, factory, values, hasLegacy } = fixture(new Map([["other-project", "keep"]]));
  const seeded = await demo.open();
  const beforeBackup = await backup(factory);
  await repo.transact((data) => {
    data.orders.pop();
    data.products.pop();
    data.demo.customers.pop();
    data.movements.pop();
    data.payments.pop();
  });
  const modified = await repo.read();
  const failingRepo = {
    read: repo.read,
    transact: (change) => repo.transact((data) => {
      change(data);
      throw new Error("Injected reset commit failure");
    }),
  };
  await assert.rejects(createDemoLifecycle(failingRepo, hasLegacy).reset(), /Injected/);
  assert.deepEqual(await repo.read(), modified);
  await demo.reset();
  await demo.reset();
  const after = await repo.read();
  assert.equal(after.demo.generation, 3);
  assert.deepEqual({ ...after, demo: { ...after.demo, generation: 1 } }, seeded);
  assert.deepEqual(await backup(factory), beforeBackup);
  assert.equal(values.get("other-project"), "keep");
});

test("protected legacy customer data and pre-existing V3 business data cannot initialize or reset", async () => {
  const legacy = fixture(new Map([[CUSTOMER_KEY, "[]"]]));
  assert.equal((await legacy.demo.open()).demo, undefined);
  await assert.rejects(legacy.demo.reset(), /原有|现有|仅可/);
  assert.equal(legacy.values.get(CUSTOMER_KEY), "[]");
  assert.equal((await backup(legacy.factory)).customers, "[]");
  const existing = fixture();
  await existing.repo.transact((data) => { data.products.push({ id: "existing-data" }); });
  const before = await existing.repo.read();
  assert.deepEqual(await existing.demo.open(), before);
  await assert.rejects(existing.demo.reset(), /仅可/);
  assert.deepEqual(await existing.repo.read(), before);
});

test("legacy V2 corruption and later legacy keys block destructive work", async () => {
  const broken = fixture(new Map([[ORDER_DATA_KEY, "{broken"]]));
  await assert.rejects(broken.demo.open(), /迁移/);
  await assert.rejects(broken.demo.reset(), /迁移/);
  assert.equal((await backup(broken.factory)).v2Orders, "{broken");
  assert.equal(broken.values.get(ORDER_DATA_KEY), "{broken");
  const other = fixture();
  await other.demo.open();
  other.values.set(CUSTOMER_KEY, "[]");
  const before = await other.repo.read();
  await assert.rejects(other.demo.reset(), /仅可/);
  assert.deepEqual(await other.repo.read(), before);
});
