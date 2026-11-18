import { useState, type FormEvent } from "react";
import {
  getProducts,
  saveProduct,
  deleteProduct,
  type Product,
} from "../services/masterDataStorage";
import { formatMoney } from "../services/orderStorage";
import "./MasterData.css";

interface ProductForm {
  sku: string;
  name: string;
  price: string;
  active: boolean;
}

const emptyForm: ProductForm = {
  sku: "",
  name: "",
  price: "",
  active: true,
};

function Products() {
  const [products, setProducts] = useState(getProducts);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const filtered = products.filter((product) => {
    const query = search.toLowerCase();
    return (
      product.name.toLowerCase().includes(query) ||
      product.sku.toLowerCase().includes(query)
    );
  });

  function startNew() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setError("");
    setMessage("");
  }

  function startEdit(product: Product) {
    setEditingId(product.id);
    setForm({
      sku: product.sku,
      name: product.name,
      price: String(product.price),
      active: product.active,
    });
    setError("");
    setMessage("");
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const sku = form.sku.trim();
    const name = form.name.trim();
    const price = Number(form.price);

    if (!sku) {
      setError("请输入商品编号 SKU");
      return;
    }
    if (!name) {
      setError("请输入商品名称");
      return;
    }
    if (form.price.trim() === "" || !Number.isFinite(price) || price < 0) {
      setError("请输入有效的单价（不能为负数）");
      return;
    }

    try {
      saveProduct(
        {
          sku,
          name,
          price: Math.round(price * 100) / 100,
          active: form.active,
        },
        editingId ?? undefined
      );

      setProducts(getProducts());
      startNew();
      setMessage("商品资料已保存");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "保存失败，请检查本地存储"
      );
    }
  }

  function handleDelete(product: Product) {
    if (!window.confirm(`确定删除商品「${product.name}」吗？`)) {
      return;
    }

    try {
      deleteProduct(product.id);
      setProducts(getProducts());
      if (editingId === product.id) startNew();
      setMessage("商品已删除");
      setError("");
    } catch {
      setError("删除失败");
    }
  }

  return (
    <div className="master-page">
      <div className="master-heading">
        <div>
          <div className="sales-breadcrumb">销售管理 / 商品管理</div>
          <h1>商品管理</h1>
          <p>维护商品编号、名称和销售单价</p>
        </div>
        <button className="master-primary" onClick={startNew}>
          + 新增商品
        </button>
      </div>

      <div className="master-layout">
        <section className="master-list-panel">
          <div className="master-toolbar">
            <input
              type="search"
              placeholder="搜索商品名称或 SKU"
              aria-label="搜索商品"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span>共 {filtered.length} 件商品</span>
          </div>

          <div className="master-table-scroll">
            <table className="master-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>商品名称</th>
                  <th>单价</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => (
                  <tr key={product.id}>
                    <td className="master-sku">{product.sku}</td>
                    <td className="master-name">{product.name}</td>
                    <td>{formatMoney(product.price)}</td>
                    <td>
                      <span
                        className={`master-status ${
                          product.active ? "enabled" : "disabled"
                        }`}
                      >
                        {product.active ? "销售中" : "已下架"}
                      </span>
                    </td>
                    <td>
                      <div className="master-row-actions">
                        <button onClick={() => startEdit(product)}>
                          编辑
                        </button>
                        <button
                          className="master-danger-text"
                          onClick={() => handleDelete(product)}
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filtered.length === 0 && (
              <div className="master-empty">
                {products.length === 0
                  ? "暂无商品资料，请先添加商品"
                  : "没有符合条件的商品"}
              </div>
            )}
          </div>
        </section>

        <aside className="master-editor">
          <div className="master-editor-title">
            <h2>{editingId ? "编辑商品" : "新增商品"}</h2>
            <p>只有「销售中」的商品可以在开单时选择</p>
          </div>

          <form onSubmit={handleSave} className="master-form">
            <label>
              商品编号 SKU <span>*</span>
              <input
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                placeholder="例如：SKU-001"
              />
            </label>

            <label>
              商品名称 <span>*</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如：无线鼠标"
              />
            </label>

            <label>
              销售单价 (MYR) <span>*</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="0.00"
              />
            </label>

            <label>
              销售状态
              <select
                value={form.active ? "active" : "inactive"}
                onChange={(e) =>
                  setForm({ ...form, active: e.target.value === "active" })
                }
              >
                <option value="active">销售中</option>
                <option value="inactive">已下架</option>
              </select>
            </label>

            {error && <p className="master-error" role="alert">{error}</p>}
            {message && <p className="master-success" role="status">{message}</p>}

            <div className="master-form-actions">
              <button type="button" onClick={startNew}>
                清空
              </button>
              <button type="submit" className="master-primary">
                保存商品
              </button>
            </div>
          </form>
        </aside>
      </div>
    </div>
  );
}

export default Products;
