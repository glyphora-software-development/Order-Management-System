/* global localStorage */
import assert from "node:assert/strict";
import console from "node:console";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import { createServer } from "vite";
import { launchBrowser, target } from "./browserTarget.mjs";

const newCustomer = "Aster Commerce Demo";
const newProduct = "Kraft mailing sleeve · 邮寄袋";
const orderDate = "2026-11-18";

async function enter(page) {
  await page.getByRole("button", { name: "进入演示" }).click();
  await page.getByRole("heading", { name: "销售工作台" }).waitFor();
}

async function go(page, name) {
  const button = page.getByRole("button", { name: "打开导航" });
  if (await button.isVisible()) await button.click();
  await page.getByRole("navigation", { name: "主要导航" }).getByRole("link", { name, exact: true }).click();
}

function read(page) {
  return page.evaluate(async () => {
    const { commerce } = await import("/src/services/commerceClient.ts");
    return commerce.read();
  });
}

async function status(page, value, label) {
  await page.getByLabel("订单状态", { exact: true }).selectOption(value);
  await page.locator(".orders-timeline").getByText(label, { exact: true }).waitFor();
}

async function payment(page, amount, reference) {
  await page.getByLabel("付款金额 (RM)").fill(amount);
  await page.getByLabel("付款日期").fill(orderDate);
  await page.getByLabel(/参考编号/).fill(reference);
  await page.getByRole("button", { name: "登记付款", exact: true }).click();
  await page.getByText("参考编号：" + reference, { exact: true }).waitFor();
}

function stable(data) {
  return { ...data, demo: data.demo && { ...data.demo, generation: 1 } };
}

test(target + " demo first visit, workflow, reset, isolation and protected data", { timeout: 180000 }, async () => {
  const server = await createServer({ cacheDir: "node_modules/.vite-oms-demo-" + target, server: { host: "127.0.0.1", port: 0 }, clearScreen: false });
  let browser;
  try {
    await server.listen();
    const base = "http://127.0.0.1:" + server.httpServer.address().port;
    browser = await launchBrowser();
    console.log(target + " browser engine " + browser.version());
    const context = await browser.newContext({ viewport: { width: 1440, height: 1160 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.setDefaultTimeout(25000);
    const screenshots = process.env.OMS_PORTFOLIO_DIR;
    if (screenshots) await mkdir(screenshots, { recursive: true });

    await page.goto(base);
    await page.getByRole("heading", { name: "Portfolio Demo" }).waitFor();
    assert.equal(await page.locator("input[type=password]").count(), 0);
    await enter(page);
    const initial = await read(page);
    assert.deepEqual([initial.demo.customers.length, initial.products.length, initial.orders.length,
      initial.payments.length, initial.movements.length], [12, 20, 32, 20, 97]);
    if (screenshots) await page.screenshot({ path: join(screenshots, "glyphora-oms-dashboard.png") });

    await go(page, "客户管理");
    await page.getByRole("textbox", { name: "客户名称", exact: true }).fill(newCustomer);
    await page.locator(".master-form textarea").fill("Demo unit 25, Fictional Trade Park, Kuala Lumpur");
    await page.getByRole("button", { name: "保存客户" }).click();
    await page.getByText(newCustomer, { exact: true }).waitFor();

    await go(page, "商品管理");
    await page.getByRole("textbox", { name: "SKU", exact: true }).fill("ENV-790");
    await page.getByRole("textbox", { name: "商品名称", exact: true }).fill(newProduct);
    await page.getByRole("spinbutton", { name: "单价 (RM)", exact: true }).fill("12.50");
    await page.getByLabel("期初库存").fill("10");
    await page.getByRole("button", { name: "保存商品" }).click();
    await page.getByRole("row").filter({ hasText: "ENV-790" }).waitFor();

    await go(page, "新建订单");
    await page.getByLabel("客户", { exact: true }).selectOption({ label: newCustomer });
    await page.getByLabel("订单日期", { exact: true }).fill(orderDate);
    await page.getByLabel("第 1 行商品", { exact: true }).selectOption({ label: "ENV-790 - " + newProduct });
    await page.getByLabel("第 1 行数量", { exact: true }).fill("4");
    await page.getByRole("button", { name: "提交订单" }).click();
    await page.getByRole("heading", { name: "订单管理" }).waitFor();
    const created = (await read(page)).orders[0];
    assert.equal(created.customer, newCustomer);
    const orderButton = page.getByRole("button", { name: created.id, exact: true });
    await orderButton.click();
    await page.waitForURL((url) => url.pathname === "/orders" && url.searchParams.get("order") === created.id);
    await status(page, "confirmed", "已确认");
    await page.getByText("已扣减库存", { exact: true }).waitFor();
    assert.equal((await read(page)).products.find((item) => item.sku === "ENV-790").currentStock, 6);
    const detailsUrl = page.url();
    await page.reload();
    await page.getByRole("heading", { name: "订单详情" }).waitFor();
    assert.equal(page.url(), detailsUrl);
    await page.getByText("已扣减库存", { exact: true }).waitFor();

    await payment(page, "15.00", "DEMO-FIRST");
    await page.getByRole("link", { name: "查看 Invoice" }).click();
    await page.getByRole("heading", { name: "Invoice", exact: true }).waitFor();
    const invoiceUrl = page.url();
    await page.reload();
    await page.getByRole("heading", { name: "Invoice", exact: true }).waitFor();
    assert.equal(page.url(), invoiceUrl);
    assert.match(await page.locator(".document-totals").innerText(), /Balance due\s+RM\s*35\.00/);
    if (screenshots) await page.screenshot({ path: join(screenshots, "glyphora-oms-invoice.png") });
    await page.getByRole("link", { name: /返回订单详情/ }).click();
    await status(page, "processing", "处理中");
    await status(page, "shipped", "已发货");
    await payment(page, "35.00", "DEMO-FINAL");
    await status(page, "completed", "已完成");
    await page.getByRole("link", { name: "查看 Delivery Order" }).click();
    await page.getByText(/Shipment recorded/).waitFor();
    const deliveryUrl = page.url();
    await page.reload();
    await page.getByText(/Shipment recorded/).waitFor();
    assert.equal(page.url(), deliveryUrl);
    await page.getByText("Recipient signature", { exact: true }).waitFor();
    await go(page, "订单管理");
    await page.getByRole("heading", { name: "订单管理", exact: true }).waitFor();
    if (screenshots) await page.screenshot({ path: join(screenshots, "glyphora-oms-orders.png") });
    await go(page, "业务报表");
    await page.getByRole("heading", { name: "付款报表" }).waitFor();
    const total = page.locator(".report-metric").filter({ hasText: "实际收款总额" }).locator("strong");
    const reported = (await total.innerText()).replace(/[^\d.]/g, "");
    assert.equal(Math.round(Number(reported) * 100), initial.payments.reduce((sum, entry) => sum + entry.amountMinor, 0) + 5000);

    const reportsUrl = page.url();
    await page.reload();
    await page.getByRole("heading", { name: "付款报表" }).waitFor();
    assert.equal(page.url(), reportsUrl);
    assert.equal((await read(page)).orders.find((order) => order.id === created.id).status, "completed");
    assert.equal((await read(page)).orders.length, 33);
    await go(page, "销售工作台");
    await page.getByRole("heading", { name: "销售工作台" }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    if (screenshots) await page.screenshot({ path: join(screenshots, "glyphora-oms-mobile.png") });
    await page.setViewportSize({ width: 1440, height: 1160 });

    const seededId = initial.orders[0].id;
    for (const [path, heading] of [
      ["/orders?order=" + seededId, "订单详情"],
      ["/reports/?from=demo#report-payments", "付款报表"],
      ["/orders/" + seededId + "/documents/invoice", "Invoice"],
      ["/orders/" + seededId + "/documents/delivery", "Delivery Order"],
    ]) {
      const another = await browser.newContext();
      const otherPage = await another.newPage();
      const deepLink = base + path;
      await otherPage.goto(deepLink);
      await otherPage.getByRole("heading", { name: "Portfolio Demo" }).waitFor();
      assert.equal(otherPage.url(), deepLink);
      await otherPage.getByRole("button", { name: "进入演示" }).click();
      await otherPage.getByRole("heading", { name: heading, exact: true }).waitFor();
      assert.equal(otherPage.url(), deepLink);
      if (path.startsWith("/reports/")) {
        assert.equal(await otherPage.getByRole("link", { name: "业务报表", exact: true }).getAttribute("aria-current"), "page");
      }
      assert.deepEqual(stable(await read(otherPage)), stable(initial));
      await another.close();
    }

    await page.evaluate(() => localStorage.setItem("unrelated-app", "preserve"));
    await go(page, "演示工具");
    await page.getByRole("button", { name: "重置演示数据", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "重置演示数据" });
    await dialog.getByRole("button", { name: "返回", exact: true }).click();
    assert.equal((await read(page)).orders.length, 33);
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) await go(page, "演示工具");
      await page.getByRole("button", { name: "重置演示数据", exact: true }).click();
      await dialog.getByRole("button", { name: "确认重置", exact: true }).click();
      await page.getByRole("heading", { name: "销售工作台" }).waitFor();
      assert.deepEqual(stable(await read(page)), stable(initial));
    }
    assert.equal((await read(page)).demo.generation, 3);
    assert.equal(await page.evaluate(() => localStorage.getItem("unrelated-app")), "preserve");
    await page.getByRole("button", { name: "退出演示" }).click();
    await page.reload();
    await page.getByRole("heading", { name: "Portfolio Demo" }).waitFor();
    await enter(page);
    assert.deepEqual(stable(await read(page)), stable(initial));

    const existing = await browser.newContext();
    const legacy = await existing.newPage();
    await legacy.goto(base);
    const legacyRaw = JSON.stringify([{ id: "legacy-client", name: "Protected Customer", email: "",
      phone: "", address: "", createdAt: "2026-11-17T00:00:00.000Z" }]);
    await legacy.evaluate((raw) => localStorage.setItem("glyphora-oms-customers", raw), legacyRaw);
    await enter(legacy);
    assert.equal((await read(legacy)).demo, undefined);
    await go(legacy, "客户管理");
    await legacy.getByText("Protected Customer", { exact: true }).waitFor();
    await go(legacy, "演示工具");
    await legacy.getByText(/保护模式/).waitFor();
    assert.equal(await legacy.getByRole("button", { name: "重置演示数据" }).count(), 0);
    assert.equal(await legacy.evaluate(() => localStorage.getItem("glyphora-oms-customers")), legacyRaw);

    const invalid = await browser.newContext();
    const damaged = await invalid.newPage();
    await damaged.goto(base);
    await damaged.evaluate(() => localStorage.setItem("glyphora-oms-orders-v2", "{damaged"));
    await damaged.getByRole("button", { name: "进入演示" }).click();
    await damaged.getByRole("alert").getByText(/旧资料已保留/).waitFor();
    assert.equal(await damaged.evaluate(() => localStorage.getItem("glyphora-oms-orders-v2")), "{damaged");
    assert.equal(await damaged.getByRole("button", { name: "重置演示数据" }).count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
});
