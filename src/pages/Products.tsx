import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCommerce } from "../components/commerceContext";
import { commerce } from "../services/commerceClient";
import { movementLabels, stockStatus, type Product } from "../services/commerceModel";
import { formatMinor, minorDecimal, parseMinor } from "../services/orderModel";
import { ConfirmDialog, EmptyState, PageHeader, TableScroll } from "../components/ui";
import { Pagination } from "../components/Pagination";
import { useListPage } from "../components/listPage";
import { useToast } from "../components/toastContext";
import "./MasterData.css";

const emptyForm = { sku: "", name: "", price: "", active: true, threshold: "0", opening: "0" };

function Products() {
  const { products, movements } = useCommerce();
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string>();
  const [stockId, setStockId] = useState<string>();
  const [form, setForm] = useState(emptyForm);
  const [quantity, setQuantity] = useState("");
  const [operation, setOperation] = useState(() => crypto.randomUUID());
  const [stockOperation, setStockOperation] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const [errorArea, setErrorArea] = useState<"product" | "stock">("product");
  const [deleteTarget, setDeleteTarget] = useState<Product>();
  const nameInput = useRef<HTMLInputElement>(null);
  const stockInput = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const query = search.trim().toLowerCase();
  const visible = products.filter((product) => !product.archived);
  const filtered = visible.filter((product) =>
    product.sku.toLowerCase().includes(query) || product.name.toLowerCase().includes(query)
  );
  const page = useListPage(filtered, search);
  const stockProduct = visible.find((product) => product.id === stockId);
  const history = movements.filter((entry) => entry.productId === stockId);

  const historyPage = useListPage(history, stockId ?? "");
  useEffect(() => { if (stockId) stockInput.current?.focus(); }, [stockId]);

  function edit(product?: Product, focus = false) {
    setEditingId(product?.id);
    setOperation(crypto.randomUUID());
    setForm(product ? {
      sku: product.sku, name: product.name, active: product.active,
      price: minorDecimal(product.priceMinor), threshold: String(product.lowStockThreshold), opening: "0",
    } : emptyForm);
    setError("");
    if (focus) nameInput.current?.focus();
  }

  function openStock(id: string) {
    setStockId(id);
    setQuantity("");
    setStockOperation(crypto.randomUUID());
    setError("");
  }

  async function perform(area: "product" | "stock", action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setErrorArea(area);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "商品操作失败");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void perform("product", async () => {
      await commerce.saveProduct({
        sku: form.sku, name: form.name, priceMinor: parseMinor(form.price),
        active: form.active, lowStockThreshold: Number(form.threshold),
      }, editingId, Number(form.opening), operation);
      edit();
      toast("商品已保存");
    });
  }

  async function handleDelete(product: Product) {
    await commerce.deleteProduct(product.id);
    if (editingId === product.id) edit();
    if (stockId === product.id) setStockId(undefined);
    toast("商品已删除");
  }

  function handleAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stockProduct) return;
    void perform("stock", async () => {
      await commerce.adjustStock(stockProduct.id, Number(quantity), stockOperation);
      setQuantity("");
      setStockOperation(crypto.randomUUID());
      toast("库存已调整");
    });
  }

  return (
    <div className="master-page">
      <PageHeader title="商品管理" description="维护商品、库存与低库存阈值"
        actions={<button className="ui-button ui-button-primary" disabled={busy} onClick={() => edit(undefined, true)}>＋ 新增商品</button>} />
      <div className="master-layout">
        <section className="master-list-panel">
          <div className="master-toolbar">
            <input type="search" aria-label="搜索商品" placeholder="搜索 SKU 或商品名称"
              value={search} onChange={(event) => setSearch(event.target.value)} />
            <span>共 {filtered.length} 件商品</span>
          </div>
          <TableScroll label="商品列表">
            <table className="master-table">
              <thead><tr><th>SKU</th><th>商品名称</th><th className="ui-numeric">单价</th><th>状态</th><th>库存</th><th>操作</th></tr></thead>
              <tbody>
                {page.rows.map((product) => (
                  <tr key={product.id}>
                    <td className="master-sku">{product.sku}</td>
                    <td className="master-name ui-ellipsis" title={product.name}>{product.name}</td>
                    <td className="ui-numeric">{formatMinor(product.priceMinor)}</td>
                    <td><span className={"ui-badge " + (product.active ? "ui-status-success" : "")}>
                      {product.active ? "启用" : "停用"}
                    </span></td>
                    <td>
                      <strong>{product.currentStock}</strong>{" "}
                      <span className={"ui-badge " + (product.currentStock <= product.lowStockThreshold ? "ui-status-warning" : "")}>{stockStatus(product)}</span>
                    </td>
                    <td>
                      <div className="master-row-actions">
                        <button disabled={busy} onClick={() => edit(product, true)}>编辑</button>
                        <button disabled={busy} onClick={() => openStock(product.id)}>调整库存 / 历史</button>
                        <button disabled={busy} className="master-danger-text" onClick={() => setDeleteTarget(product)}>删除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
          {filtered.length === 0 && <EmptyState title={visible.length ? "没有符合条件的商品" : "暂无商品"}
            detail={visible.length ? "试着搜索 SKU 或商品名称。" : "可从表单新增商品并设置期初库存。"} />}
          <Pagination {...page} count={filtered.length} />
        </section>
        <aside className="master-editor">
          <div className="master-editor-title"><h2>{editingId ? "编辑商品" : "新增商品"}</h2></div>
          <form className="master-form" onSubmit={handleSave}>
            <label><span>SKU <span className="ui-required" aria-hidden="true">*</span></span>
              <input ref={nameInput} value={form.sku}
                aria-invalid={errorArea === "product" && error.includes("SKU")}
                aria-describedby={errorArea === "product" && error.includes("SKU") ? "product-error" : undefined} onChange={(event) => setForm({ ...form, sku: event.target.value })} required />
            </label>
            <label><span>商品名称 <span className="ui-required" aria-hidden="true">*</span></span>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </label>
            <label><span>单价 (RM) <span className="ui-required" aria-hidden="true">*</span></span>
              <input type="number" min="0" step="0.01" value={form.price}
                onChange={(event) => setForm({ ...form, price: event.target.value })} required />
            </label>
            <label>状态
              <select value={form.active ? "enabled" : "disabled"}
                onChange={(event) => setForm({ ...form, active: event.target.value === "enabled" })}>
                <option value="enabled">启用</option>
                <option value="disabled">停用</option>
              </select>
            </label>
            {!editingId && <label>期初库存
              <input type="number" min="0" step="1" required value={form.opening}
                onChange={(event) => setForm({ ...form, opening: event.target.value })} />
            </label>}
            <label>低库存阈值
              <input type="number" min="0" step="1" required value={form.threshold}
                onChange={(event) => setForm({ ...form, threshold: event.target.value })} />
            </label>
            {error && errorArea === "product" && <p id="product-error" className="ui-feedback ui-feedback-error" role="alert">{error}</p>}
            <div className="master-form-actions">
              <button className="ui-button" type="button" disabled={busy} onClick={() => edit()}>清空</button>
              <button type="submit" disabled={busy} className="master-primary">保存商品</button>
            </div>
          </form>
        </aside>
      </div>
      {stockProduct && (
        <section className="master-list-panel master-stock-panel">
          <div className="master-editor-title">
            <h2>{stockProduct.name} · 库存</h2>
            <p>当前库存 {stockProduct.currentStock} · {stockStatus(stockProduct)}</p>
          </div>
          <form className="master-form" onSubmit={handleAdjustment}>
            <label>{history.length ? "调整数量（正数入库，负数出库）" : "设置期初库存"}
              <input ref={stockInput} type="number" step="1" required value={quantity}
                aria-invalid={errorArea === "stock" && Boolean(error)}
                aria-describedby={errorArea === "stock" && error ? "stock-error" : undefined}
                onChange={(event) => setQuantity(event.target.value)} />
            </label>
            {error && errorArea === "stock" && <p id="stock-error" className="ui-feedback ui-feedback-error" role="alert">{error}</p>}
            <div className="master-form-actions">
              <button className="ui-button" type="button" disabled={busy} onClick={() => setStockId(undefined)}>关闭库存</button>
              <button type="submit" disabled={busy} className="master-primary">保存库存</button>
            </div>
          </form>
          {history.length ? (
            <TableScroll label="库存流水">
              <table className="master-table">
                <thead><tr><th>时间</th><th>类型</th><th>数量</th><th>调整前</th><th>调整后</th><th>订单</th></tr></thead>
                <tbody>{historyPage.rows.map((entry) => (
                  <tr key={entry.id}>
                    <td>{new Date(entry.createdAt).toLocaleString("zh-MY", { timeZone: "Asia/Kuala_Lumpur" })}</td>
                    <td>{movementLabels[entry.type]}</td>
                    <td>{entry.quantity}</td>
                    <td>{entry.previousStock}</td>
                    <td>{entry.newStock}</td>
                    <td>{entry.orderId ?? "—"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </TableScroll>
          ) : <EmptyState title="暂无库存流水" />}
          <Pagination {...historyPage} count={history.length} />
        </section>
      )}
      {deleteTarget && <ConfirmDialog title="删除商品" detail={"确定删除「" + deleteTarget.name + "」？历史库存流水会保留。"}
        confirmLabel="确认删除" onClose={() => setDeleteTarget(undefined)} onConfirm={() => handleDelete(deleteTarget)} />}
    </div>
  );
}

export default Products;
