
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  createOrder,
  calculateTotal,
  formatMoney,
  type OrderItem,
  type OrderStatus,
} from "../services/orderStorage";
import {
  getCustomers,
  getProducts,
} from "../services/masterDataStorage";
import "./NewOrder.css";

type OrderFormItem = OrderItem & {
  productId: string;
};

function makeItem(): OrderFormItem {
  return {
    id: crypto.randomUUID(),
    productId: "",
    name: "",
    quantity: 1,
    price: 0,
  };
}

function NewOrder() {
  const navigate = useNavigate();

  const [customers] = useState(getCustomers);
  const [products] = useState(() =>
    getProducts().filter((p) => p.active)
  );

  const [customerId, setCustomerId] = useState("");

  const [date, setDate] = useState(() => {
    const now = new Date();
    const local = new Date(
      now.getTime() - now.getTimezoneOffset() * 60000
    );
    return local.toISOString().slice(0, 10);
  });

  const [remarks, setRemarks] = useState("");
  const [items, setItems] = useState<OrderFormItem[]>([makeItem()]);
  const [error, setError] = useState("");

  const selectedCustomer = customers.find(
    (customer) => customer.id === customerId
  );

  const total = calculateTotal(items);

  function selectProduct(rowId: string, productId: string) {
    const product = products.find((p) => p.id === productId);

    setItems((current) =>
      current.map((item) =>
        item.id === rowId
          ? {
              ...item,
              productId,
              name: product?.name ?? "",
              price: product?.price ?? 0,
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

  function saveOrder(status: OrderStatus) {
    if (!selectedCustomer) {
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
          !item.productId ||
          !item.name.trim() ||
          !Number.isInteger(item.quantity) ||
          item.quantity <= 0 ||
          !Number.isFinite(item.price) ||
          item.price < 0 ||
          Math.abs(
            item.price * 100 - Math.round(item.price * 100)
          ) > 0.000001
      )
    ) {
      setError("请选择商品，并检查数量及价格");
      return;
    }

    try {
      createOrder({
        customer: selectedCustomer.name,
        date,
        items: items.map(
          ({ id, name, quantity, price }) => ({
            id,
            name,
            quantity,
            price,
          })
        ),
        remarks: remarks.trim(),
        status,
      });

      navigate("/orders");
    } catch {
      setError("订单保存失败，请检查本地存储");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveOrder("pending");
  }

  return (
    <div className="new-order-page">
      <div className="sales-page-heading">
        <div>
          <div className="sales-breadcrumb">
            销售管理 / 订单管理 / 新建订单
          </div>
          <h1>新建销售订单</h1>
          <p>选择客户及商品，创建销售订单</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <section className="order-form-panel">
          <div className="order-form-heading">
            <h2>订单基本资料</h2>
            <Link to="/customers">管理客户 →</Link>
          </div>

          <div className="order-form-grid order-form-fields">
            <label>
              客户
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                required
              >
                <option value="">请选择客户</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              订单日期
              <input
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

          <div className="order-form-table-scroll">
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
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <select
                        value={item.productId}
                        onChange={(e) =>
                          selectProduct(item.id, e.target.value)
                        }
                        required
                      >
                        <option value="">选择商品</option>

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

                    <td>
                      <input
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

                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.price}
                        onChange={(e) =>
                          updateItem(item.id, {
                            price: Number(e.target.value),
                          })
                        }
                        required
                      />
                    </td>

                    <td>
                      {formatMoney(item.quantity * item.price)}
                    </td>

                    <td>
                      <button
                        type="button"
                        className="order-remove"
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
          </div>

          {products.length === 0 && (
            <p className="order-hint">
              尚无启用的商品，请先前往商品管理新增商品。
            </p>
          )}
        </section>

        <section className="order-form-panel">
          <h2>订单备注</h2>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="填写客户特殊要求或交付备注"
            rows={3}
          />
        </section>

        {error && (
          <p className="order-form-error" role="alert">
            {error}
          </p>
        )}

        <div className="order-form-bottom">
          <div>
            <span>订单总金额</span>
            <strong>{formatMoney(total)}</strong>
          </div>

          <div className="order-form-actions">
            <button
              type="button"
              className="order-draft-button"
              onClick={() => saveOrder("draft")}
            >
              保存草稿
            </button>

            <button type="submit">
              提交订单
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default NewOrder;
