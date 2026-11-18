
import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  isEditable,
  calculateTotal,
  formatMinor,
  minorDecimal,
  parseMinor,
  isSubmitted,
  orderTotalForEdit,
  type OrderItem,
  type SalesOrder,
} from "../services/orderStorage";
import { useCustomerDirectory } from "../components/useCustomerDirectory";
import { commerce } from "../services/commerceClient";
import { useCommerce } from "../components/commerceContext";
import { PageHeader, TableScroll } from "../components/ui";
import { useToast } from "../components/toastContext";
import "./NewOrder.css";

type OrderFormItem = Omit<OrderItem, "priceMinor"> & {
  productId: string;
  price: string;
};

function makeItem(): OrderFormItem {
  return {
    id: crypto.randomUUID(),
    productId: "",
    name: "",
    quantity: 1,
    price: "0.00",
  };
}

function NewOrder() {
  const [params] = useSearchParams();
  const editId = params.get("edit");
  const copyId = params.get("copy");
  const sourceId = editId ?? copyId;
  const { orders } = useCommerce();
  const source = orders.find((order) => order.id === sourceId);

  if (sourceId && (!source || (editId && !isEditable(source)))) {
    return <p role="alert">订单不存在或已锁定。<Link to="/orders">返回订单列表</Link></p>;
  }

  return <OrderForm key={(editId ? "edit:" : "new:") + (sourceId ?? "")} source={source} editing={Boolean(editId)} />;
}

function OrderForm({ source, editing }: { source?: SalesOrder; editing: boolean }) {
  const navigate = useNavigate();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  const { customers } = useCustomerDirectory();
  const { products: inventory } = useCommerce();
  const products = inventory.filter((product) => product.active && !product.archived);
  const [operationId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  const [customerId, setCustomerId] = useState(() =>
    editing || customers.some((customer) => customer.id === source?.customerId)
      ? source?.customerId ?? ""
      : ""
  );

  const [date, setDate] = useState(() => {
    if (editing && source) return source.date;
    const now = new Date();
    const local = new Date(
      now.getTime() - now.getTimezoneOffset() * 60000
    );
    return local.toISOString().slice(0, 10);
  });

  const [remarks, setRemarks] = useState(source?.remarks ?? "");
  const [items, setItems] = useState<OrderFormItem[]>(() => source
    ? source.items.map((item) => ({
        id: editing ? item.id : crypto.randomUUID(),
        name: item.name,
        sku: item.sku ?? (editing ? undefined : products.find((product) => product.id === item.productId)?.sku),
        quantity: item.quantity,
        price: minorDecimal(item.priceMinor),
        productId: editing || products.some((product) => product.id === item.productId)
          ? item.productId ?? ""
          : "",
      }))
    : [makeItem()]);
  const [error, setError] = useState("");

  const selectedCustomer = customers.find(
    (customer) => customer.id === customerId
  );
  const historicalCustomerId = source?.customerId ?? "";

  function orderItem({ id, productId, sku, name, quantity, price }: OrderFormItem): OrderItem {
    return { id, productId: productId || undefined, sku, name, quantity, priceMinor: parseMinor(price) };
  }

  function previewTotal(items: OrderFormItem[], original?: SalesOrder): string {
    try {
      const normalized = items.map(orderItem);
      const calculated = calculateTotal(normalized);
      return formatMinor(original ? orderTotalForEdit(original, normalized, calculated) : calculated);
    } catch {
      return "—";
    }
  }

  const total = previewTotal(items, editing ? source : undefined);

  function selectProduct(rowId: string, productId: string) {
    const product = products.find((p) => p.id === productId);

    setItems((current) =>
      current.map((item) =>
        item.id === rowId
          ? {
              ...item,
              productId,
              name: product?.name ?? "",
              sku: product?.sku,
              price: minorDecimal(product?.priceMinor ?? 0),
            }
          : item
      )
    );

    setError("");
  }

  function updateItem(
    id: string,
    changes: Partial<OrderFormItem>
  ) {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, ...changes } : item
      )
    );
    setError("");
  }

  function addItem() {
    setItems((current) => [...current, makeItem()]);
  }

  function removeItem(id: string) {
    setItems((current) =>
      current.length > 1
        ? current.filter((item) => item.id !== id)
        : current
    );
  }

  async function saveOrder(submit: boolean) {
    if (inFlight.current) return;
    const keepCustomer = editing && customerId === (source?.customerId ?? "");
    if (!selectedCustomer && !keepCustomer) {
      setError("请选择客户");
      return;
    }

    if (!date) {
      setError("请选择订单日期");
      return;
    }

    if (
      items.some(
        (item) =>
          (!products.some((product) => product.id === item.productId) &&
            !(editing && source?.items.some((original) =>
              original.id === item.id && (original.productId ?? "") === item.productId
            ))) ||
          !item.name.trim()
      )
    ) {
      setError("请选择商品，并检查数量及价格");
      return;
    }

    inFlight.current = true;
    setSaving(true);
    try {
      const data = {
        customer: selectedCustomer?.name ?? source?.customer ?? "",
        customerId: selectedCustomer?.id ?? source?.customerId,
        customerSnapshot: selectedCustomer ? {
          email: selectedCustomer.email,
          phone: selectedCustomer.phone,
          billingAddress: selectedCustomer.address,
          deliveryAddress: selectedCustomer.address,
        } : undefined,
        date,
        items: items.map(orderItem),
        remarks: remarks.trim(),
      };
      if (editing && source) await commerce.updateOrder(source.id, data, submit);
      else await commerce.createOrder(data, submit, operationId);

      toast(editing ? "订单已保存" : submit ? "订单已提交，等待确认" : "草稿已保存");
      navigate("/orders");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "订单保存失败");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveOrder(true);
  }

  return (
    <div className="new-order-page">
      <PageHeader title={editing ? "编辑销售订单" : source ? "复制销售订单" : "新建销售订单"}
        actions={<Link className="ui-button" to="/orders">返回订单列表</Link>} />
      <form ref={formRef} onSubmit={handleSubmit}>
        <section className="order-form-panel">
          <div className="order-form-heading">
            <h2>订单基本资料</h2>
            <Link to="/customers">管理客户 →</Link>
          </div>

          <div className="order-form-grid order-form-fields">
            <label>
              <span>客户 <span className="ui-required" aria-hidden="true">*</span></span>
              <select aria-label="客户"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                required={!editing || Boolean(customerId)}
              >
                {editing && source && !customers.some((customer) => customer.id === historicalCustomerId) && (
                  <option value={historicalCustomerId}>{source.customer}（历史资料）</option>
                )}
                {(!editing || historicalCustomerId) && <option value="">请选择客户</option>}
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>订单日期 <span className="ui-required" aria-hidden="true">*</span></span>
              <input aria-label="订单日期"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>
          </div>

          {selectedCustomer && (
            <div className="order-customer-info">
              <span>
                电话：{selectedCustomer.phone || "未填写"}
              </span>
              <span>
                邮箱：{selectedCustomer.email || "未填写"}
              </span>
              <span>
                地址：{selectedCustomer.address || "未填写"}
              </span>
            </div>
          )}

          {customers.length === 0 && (
            <p className="order-hint">
              尚无客户资料，请先前往客户管理新增客户。
            </p>
          )}
        </section>

        <section className="order-form-panel">
          <div className="order-form-heading">
            <h2>商品明细</h2>

            <div className="order-heading-actions">
              <Link to="/products">管理商品 →</Link>
              <button type="button" onClick={addItem}>
                + 添加商品
              </button>
            </div>
          </div>

          <div className="order-form-table-scroll"><TableScroll label="订单商品明细">
            <table className="order-form-table">
              <thead>
                <tr>
                  <th>商品</th>
                  <th>数量</th>
                  <th>单价 (RM)</th>
                  <th>小计</th>
                  <th>操作</th>
                </tr>
              </thead>

              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id}>
                    <td data-label="商品">
                      <select aria-label={"第 " + (index + 1) + " 行商品"}
                        value={item.productId}
                        onChange={(e) =>
                          selectProduct(item.id, e.target.value)
                        }
                        required={!editing || Boolean(item.productId)}
                      >
                        {editing && item.name && !products.some((product) => product.id === item.productId)
                          ? <option value={item.productId}>{item.name}（历史资料）</option>
                          : <option value="">选择商品</option>}

                        {products.map((product) => (
                          <option
                            key={product.id}
                            value={product.id}
                          >
                            {product.sku} - {product.name}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td data-label="数量">
                      <input aria-label={"第 " + (index + 1) + " 行数量"}
                        type="number"
                        min="1"
                        step="1"
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(item.id, {
                            quantity: Number(e.target.value),
                          })
                        }
                        required
                      />
                    </td>

                    <td data-label="单价 (RM)">
                      <input aria-label={"第 " + (index + 1) + " 行单价"}
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.price}
                        onChange={(e) =>
                          updateItem(item.id, {
                            price: e.target.value,
                          })
                        }
                        required
                      />
                    </td>

                    <td data-label="小计" className="ui-numeric">
                      {previewTotal([item])}
                    </td>

                    <td>
                      <button
                        type="button"
                        className="order-remove"
                        aria-label={"移除第 " + (index + 1) + " 行商品"}
                        disabled={items.length === 1}
                        onClick={() => removeItem(item.id)}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll></div>

          {products.length === 0 && (
            <p className="order-hint">
              尚无启用的商品，请先前往商品管理新增商品。
            </p>
          )}
        </section>

        <section className="order-form-panel">
          <h2>订单备注</h2>
          <textarea
            aria-label="订单备注"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="填写客户特殊要求或交付备注"
            rows={3}
          />
        </section>

        {error && (
          <p className="ui-feedback ui-feedback-error" role="alert">
            {error}
          </p>
        )}

        <div className="order-form-bottom">
          <div>
            <span>订单总金额</span>
            <strong>{total}</strong>
          </div>

          <div className="order-form-actions">
            {(!editing || !source || !isSubmitted(source)) && <button
              type="button"
              className="ui-button order-draft-button"
              disabled={saving}
              onClick={() => { if (formRef.current?.reportValidity()) void saveOrder(false); }}
            >
              保存草稿
            </button>}

            <button type="submit" className="ui-button ui-button-primary" disabled={saving}>
              {editing && source && isSubmitted(source) ? "保存修改" : "提交订单"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default NewOrder;
