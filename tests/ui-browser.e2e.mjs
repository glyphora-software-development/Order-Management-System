/* global document, localStorage */
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import { launchBrowser, target } from "./browserTarget.mjs";
import { createServer } from "vite";

const day = "2026-11-18";
const fixtureCustomer = "Meridian Trading Demo";
const fixtureProduct = "Corrugated Carton · 瓦楞纸箱";

async function eventually(check) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return;
    await setTimeout(75);
  }
  assert.fail("UI did not reach the expected state");
}

async function login(page) {
  await page.getByRole("button", { name: "进入演示" }).press("Enter");
  await page.getByRole("heading", { name: "销售工作台" }).waitFor();
}

async function go(page, name) {
  const menu = page.getByRole("button", { name: "打开导航" });
  if (await menu.isVisible()) await menu.click();
  const link = page.getByRole("navigation", { name: "主要导航" }).getByRole("link", { name, exact: true });
  await link.click();
}

function row(page, id) { return page.getByRole("row").filter({ hasText: id }); }

async function createOrder(page, quantity, note, lines = 1) {
  await go(page, "新建订单");
  await page.getByLabel("客户", { exact: true }).selectOption({ label: fixtureCustomer });
  await page.getByLabel("订单日期", { exact: true }).fill(day);
  for (let line = 1; line <= lines; line++) {
    if (line > 1) await page.getByRole("button", { name: /添加商品/ }).click();
    await page.getByLabel("第 " + line + " 行商品", { exact: true }).selectOption({ label: "GLY-101 - " + fixtureProduct });
    await page.getByLabel("第 " + line + " 行数量", { exact: true }).fill(String(quantity));
  }
  await page.getByLabel("订单备注").fill(note);
  await page.getByRole("button", { name: "提交订单" }).click();
  await page.getByRole("heading", { name: "订单管理" }).waitFor();
  return (await page.locator(".orders-id").first().innerText()).trim();
}

async function openOrder(page, id) {
  await row(page, id).getByRole("button", { name: "查看", exact: true }).click();
  await page.getByRole("heading", { name: "订单详情" }).waitFor();
}

async function status(page, next, label) {
  await page.getByLabel("订单状态", { exact: true }).selectOption(next);
  await page.locator(".orders-timeline").getByText(label, { exact: true }).waitFor();
}

function metric(page, label) {
  return page.locator(".dashboard-kpi").filter({ has: page.getByText(label, { exact: true }) }).locator(":scope > strong");
}

function assertAmount(text, amount) {
  assert.match(text, new RegExp("^RM\\s*" + amount.replace(".", "\\.") + "$"));
}

async function noPageOverflow(page) {
  assert.equal(await page.evaluate(() => {
    const main = document.querySelector(".workspace-content");
    return document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 &&
      main.scrollWidth <= main.clientWidth + 1;
  }), true, "The main workspace may not scroll horizontally");
}

async function savePdf(page, name, output) {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.getByRole("button", { name: "导出 PDF", exact: true }).click(),
  ]);
  assert.equal(download.suggestedFilename(), name);
  const bytes = await readFile(await download.path());
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  const pages = (bytes.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
  if (target === "edge") assert.equal(pages, 3);
  else assert.ok(pages > 1, "A long document needs multiple pages");
  if (output) await download.saveAs(join(output, name));
}

async function addOverviewFixtures(page) {
  await page.evaluate(async ({ customer, day }) => {
    const { commerce } = await import("/src/services/commerceClient.ts");
    const snapshot = await commerce.read();
    const customerId = snapshot.orders[0].customerId;
    const items = [
      ["GLY-204", "Packing Sleeve", 475, 80, 10],
      ["GLY-308", "Tamper Seal", 290, 60, 10],
      ["GLY-422", "Shipping Label Roll", 850, 70, 10],
      ["GLY-510", "Heavy Duty Pallet Wrap", 1840, 7, 6],
      ["GLY-628", "Dispatch Envelope", 125, 3, 4],
    ];
    const catalog = [];
    for (const [sku, name, priceMinor, stock, lowStockThreshold] of items) {
      catalog.push(await commerce.saveProduct({ sku, name, priceMinor, active: true, lowStockThreshold }, undefined, stock));
    }
    const company = [customer, "Northbridge Supply Demo", "Harbor Retail Demo", "Orchid Wholesale Demo"];
    for (let index = 0; index < 14; index++) {
      const product = catalog[index % 4];
      const quantity = index % 4 === 3 ? 1 : (index * 3 % 8) + 1;
      const date = "2026-11-" + String(10 + index % 9).padStart(2, "0");
      const order = await commerce.createOrder({
        customerId, customer: company[index % company.length], date, remarks: "Isolated browser fixture",
        items: [{ id: "line", productId: product.id, sku: product.sku, name: product.name, quantity, priceMinor: product.priceMinor }],
      }, true);
      if (index % 4 === 3 || index === 12) continue;
      await commerce.updateOrderStatus(order.id, "confirmed");
      if (index % 3 === 1) await commerce.recordPayment(order.id, { amountMinor: order.totalMinor, method: "transfer", date: day }, "demo-receipt-" + index);
      if (index % 3 !== 0) await commerce.updateOrderStatus(order.id, "processing");
      if (index % 3 === 1) {
        await commerce.updateOrderStatus(order.id, "shipped");
        if (index % 2 === 0) await commerce.updateOrderStatus(order.id, "completed");
      }
    }
  }, { customer: fixtureCustomer, day });
}

test(target + " UI, keyboard, responsive layout and 53-line documents", { timeout: 220000 }, async () => {
  const vite = await createServer({ cacheDir: "node_modules/.vite-oms-ui-" + target, server: { host: "127.0.0.1", port: 0, strictPort: true }, clearScreen: false });
  let browser;
  try {
    await vite.listen();
    const address = vite.httpServer.address();
    const base = "http://127.0.0.1:" + address.port;
    browser = await launchBrowser();
    const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, acceptDownloads: true });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const screenshots = process.env.OMS_SCREENSHOTS_DIR;
    const pdfs = process.env.OMS_PDF_DIR;
    if (screenshots) await mkdir(screenshots, { recursive: true });
    if (pdfs) await mkdir(pdfs, { recursive: true });

    await page.goto(base);
    await page.evaluate(() => localStorage.setItem("glyphora-oms-customers", "[]"));
    await login(page);
    await page.getByText("暂无销售趋势", { exact: true }).waitFor();
    assertAmount(await metric(page, "有效销售额").innerText(), "0.00");

    await go(page, "客户管理");
    await page.getByRole("button", { name: /新增客户/ }).click();
    assert.equal(await page.getByRole("textbox", { name: "客户名称", exact: true }).evaluate((node) => node === document.activeElement), true);
    await page.getByRole("textbox", { name: "客户名称", exact: true }).fill(fixtureCustomer);
    await page.locator(".master-form textarea").fill("No. 8, Example Trade Centre, Kuala Lumpur");
    await page.getByRole("button", { name: "保存客户" }).click();
    await page.getByText("客户资料已保存", { exact: true }).waitFor();
    const removeCustomer = row(page, fixtureCustomer).getByRole("button", { name: "删除", exact: true });
    await removeCustomer.click();
    await page.getByRole("dialog", { name: "删除客户" }).waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(await removeCustomer.evaluate((node) => node === document.activeElement), true);

    await go(page, "商品管理");
    await page.getByRole("textbox", { name: "SKU", exact: true }).fill("GLY-101");
    await page.getByRole("textbox", { name: "商品名称", exact: true }).fill(fixtureProduct);
    await page.getByRole("spinbutton", { name: "单价 (RM)", exact: true }).fill("12.50");
    await page.getByLabel("期初库存").fill("60");
    await page.getByLabel("低库存阈值").fill("8");
    await page.getByRole("button", { name: "保存商品" }).click();
    await row(page, "GLY-101").getByText("库存正常", { exact: true }).waitFor();
    await row(page, "GLY-101").getByRole("button", { name: "删除", exact: true }).click();
    const archived = page.getByRole("dialog", { name: "删除商品" });
    await archived.getByRole("button", { name: "确认删除" }).click();
    await archived.getByRole("alert").getByText(/待履约|库存/).waitFor();
    await archived.getByRole("button", { name: "返回", exact: true }).click();

    const id = await createOrder(page, 2, "UI interaction test");
    await go(page, "销售工作台");
    assert.equal(await metric(page, "待确认订单").innerText(), "1");
    assertAmount(await metric(page, "有效销售额").innerText(), "0.00");
    await go(page, "订单管理");
    await page.getByRole("searchbox", { name: "搜索订单" }).fill("missing order");
    await page.getByText("没有符合条件的订单", { exact: true }).waitFor();
    await page.getByRole("searchbox", { name: "搜索订单" }).fill(id);
    await page.getByLabel("按订单状态筛选").selectOption("submitted");
    await page.getByLabel("订单排序").selectOption("totalAscending");
    await openOrder(page, id);
    await page.getByRole("link", { name: "编辑订单" }).click();
    await page.getByLabel("第 1 行数量", { exact: true }).fill("3");
    await page.getByRole("button", { name: "保存修改" }).click();
    await openOrder(page, id);
    await status(page, "confirmed", "已确认");
    await page.getByText("已扣减库存", { exact: true }).waitFor();
    await page.getByLabel("付款金额 (RM)").fill("10.00");
    await page.getByLabel("付款日期").fill(day);
    await page.getByRole("button", { name: "登记付款", exact: true }).click();
    await page.locator(".orders-payment-summary").getByText("部分付款").waitFor();
    await go(page, "销售工作台");
    assertAmount(await metric(page, "有效销售额").innerText(), "37.50");
    assertAmount(await metric(page, "实际收款").innerText(), "10.00");
    assertAmount(await metric(page, "未收款余额").innerText(), "27.50");
    await page.getByText("查看每日销售数据").press("Enter");
    assert.equal(await page.locator(".dashboard-trend-data").getAttribute("open"), "");
    await go(page, "商品管理");
    await row(page, "GLY-101").getByText("57", { exact: true }).waitFor();

    const cancelled = await createOrder(page, 4, "Cancellation test");
    await openOrder(page, cancelled);
    await status(page, "confirmed", "已确认");
    await page.getByLabel("订单状态", { exact: true }).selectOption("cancelled");
    const dialog = page.getByRole("dialog", { name: "取消订单" });
    await dialog.getByRole("button", { name: "返回", exact: true }).click();
    assert.equal(await page.getByLabel("订单状态", { exact: true }).inputValue(), "confirmed");
    await page.getByLabel("订单状态", { exact: true }).selectOption("cancelled");
    await dialog.getByLabel(/取消原因/).fill(" ");
    await dialog.getByRole("button", { name: "确认取消订单" }).click();
    await dialog.getByRole("alert").getByText("请填写取消原因").waitFor();
    await dialog.getByLabel(/取消原因/).fill("Customer agreed");
    await dialog.getByRole("button", { name: "确认取消订单" }).click();
    await page.getByText("已恢复库存", { exact: true }).waitFor();
    await go(page, "商品管理");
    await row(page, "GLY-101").getByText("57", { exact: true }).waitFor();

    const docId = await createOrder(page, 1, "53-line document regression", 53);
    await openOrder(page, docId);
    await status(page, "confirmed", "已确认");
    await page.getByRole("link", { name: "查看 Invoice" }).click();
    await page.getByRole("heading", { name: "Invoice", exact: true }).waitFor();
    assert.equal(await page.locator(".document-table tbody tr").count(), 53);
    await savePdf(page, "INV-" + docId + ".pdf", pdfs);
    if (pdfs && target !== "firefox") await page.pdf({ path: join(pdfs, target + "-print.pdf"), preferCSSPageSize: true, printBackground: true });
    await page.emulateMedia({ media: "print" });
    assert.equal(await page.locator(".sidebar").isVisible(), false);
    assert.equal(await page.getByRole("heading", { name: "Invoice", exact: true }).isVisible(), true);
    await page.emulateMedia({ media: null });
    await page.getByRole("link", { name: /返回订单详情/ }).click();
    await status(page, "processing", "处理中");
    await status(page, "shipped", "已发货");
    await page.getByRole("link", { name: "查看 Delivery Order" }).click();
    await page.getByText(/Shipment recorded/).waitFor();
    await savePdf(page, "DO-" + docId + ".pdf", pdfs);
    if (pdfs && target !== "firefox") await page.pdf({ path: join(pdfs, target + "-delivery-print.pdf"), preferCSSPageSize: true, printBackground: true });

    await go(page, "业务报表");
    await page.getByLabel("开始日期").fill(day);
    await page.getByLabel("结束日期").fill(day);
    const sales = page.locator(".report-metric").filter({ hasText: "有效销售额" }).locator("strong");
    assertAmount(await sales.innerText(), "700.00");
    await page.reload();
    await page.getByRole("heading", { name: "业务报表" }).waitFor();
    await go(page, "销售工作台");
    await page.getByRole("heading", { name: "销售工作台" }).waitFor();
    assertAmount(await metric(page, "有效销售额").innerText(), "700.00");

    await addOverviewFixtures(page);
    await eventually(async () => Number(await metric(page, "订单总数").innerText()) >= 17);
    await go(page, "订单管理");
    await page.getByRole("button", { name: "下一页", exact: true }).click();
    await page.getByRole("navigation", { name: "列表分页" }).getByText(/第 2 \/ 2 页/).waitFor();
    await page.getByRole("searchbox").fill(id);
    await eventually(async () => await page.locator(".orders-id").count() === 1);
    await go(page, "销售工作台");

    for (const width of [1920, 1280, 768, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
      await noPageOverflow(page);
      await go(page, "业务报表");
      await page.getByRole("heading", { name: "库存报表" }).waitFor();
      await noPageOverflow(page);
      await go(page, "新建订单");
      await page.getByLabel("客户", { exact: true }).selectOption({ label: fixtureCustomer });
      await page.getByLabel("第 1 行数量", { exact: true }).fill("2");
      await noPageOverflow(page);
      await go(page, "销售工作台");
      await page.getByRole("heading", { name: "销售工作台" }).waitFor();
      if (screenshots && width === 1280) {
        await page.setViewportSize({ width, height: 1150 });
        await page.screenshot({ path: join(screenshots, "oms-phase4-desktop.png") });
      }
      if (width === 390) {
        if (screenshots) await page.screenshot({ path: join(screenshots, "oms-phase4-mobile.png") });
        const trigger = page.getByRole("button", { name: "打开导航" });
        await trigger.press("Enter");
        const drawer = page.getByRole("dialog", { name: "工作区导航" });
        await drawer.getByRole("link", { name: "销售工作台" }).and(drawer.locator("[aria-current=page]")).waitFor();
        if (screenshots) await page.screenshot({ path: join(screenshots, "oms-phase4-mobile-navigation.png") });
        await page.keyboard.press("Escape");
        await drawer.waitFor({ state: "hidden" });
        assert.equal(await trigger.evaluate((node) => node === document.activeElement), true);
        await go(page, "客户管理");
        await row(page, fixtureCustomer).getByRole("button", { name: "删除", exact: true }).click();
        const mobileDialog = page.getByRole("dialog", { name: "删除客户" });
        const bounds = await mobileDialog.boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y + bounds.height <= 844);
        await page.keyboard.press("Tab");
        assert.equal(await mobileDialog.evaluate((node) => node.contains(document.activeElement)), true);
        await page.keyboard.press("Escape");
        await mobileDialog.waitFor({ state: "hidden" });
        await go(page, "订单管理");
        await page.getByRole("searchbox").fill(docId);
        await row(page, docId).getByRole("button", { name: docId, exact: true }).click();
        await page.getByRole("link", { name: "查看 Invoice" }).click();
        await page.getByRole("heading", { name: "Invoice", exact: true }).waitFor();
        await noPageOverflow(page);
        await page.getByRole("link", { name: "Delivery Order", exact: true }).click();
        await page.getByRole("heading", { name: "Delivery Order", exact: true }).waitFor();
        await noPageOverflow(page);
      }
    }
    assert.deepEqual(pageErrors, []);
  } finally {
    await browser?.close();
    await vite.close();
  }
});
