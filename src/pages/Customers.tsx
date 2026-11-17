
import { useState, type FormEvent } from "react";
import {
  getCustomers,
  saveCustomer,
  deleteCustomer,
  type Customer,
} from "../services/masterDataStorage";
import "./MasterData.css";

type CustomerForm = Pick<
  Customer,
  "name" | "phone" | "email" | "address"
>;

const emptyForm: CustomerForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
};

function Customers() {
  const [customers, setCustomers] = useState(getCustomers);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const filtered = customers.filter((customer) => {
    const query = search.toLowerCase();
    return (
      customer.name.toLowerCase().includes(query) ||
      customer.phone.toLowerCase().includes(query) ||
      customer.email.toLowerCase().includes(query)
    );
  });

  function startNew() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setError("");
    setMessage("");
  }

  function startEdit(customer: Customer) {
    setEditingId(customer.id);
    setForm({
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
    });
    setError("");
    setMessage("");
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.name.trim()) {
      setError("请输入客户名称");
      return;
    }

    try {
      saveCustomer(
        {
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          address: form.address.trim(),
        },
        editingId ?? undefined
      );

      setCustomers(getCustomers());
      startNew();
      setMessage("客户资料已保存");
    } catch {
      setError("保存失败，请检查本地存储");
    }
  }

  function handleDelete(customer: Customer) {
    if (
      !window.confirm(`确定删除客户「${customer.name}」吗？`)
    ) {
      return;
    }

    try {
      deleteCustomer(customer.id);
      setCustomers(getCustomers());
      if (editingId === customer.id) startNew();
      setMessage("客户已删除");
      setError("");
    } catch {
      setError("删除失败");
    }
  }

  return (
    <div className="master-page">
      <div className="master-heading">
        <div>
          <div className="sales-breadcrumb">
            销售管理 / 客户管理
          </div>
          <h1>客户管理</h1>
          <p>维护公司客户资料和联系方式</p>
        </div>
        <button className="master-primary" onClick={startNew}>
          + 新增客户
        </button>
      </div>

      <div className="master-layout">
        <section className="master-list-panel">
          <div className="master-toolbar">
            <input
              type="search"
              placeholder="搜索客户名称、电话或邮箱"
              aria-label="搜索客户"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span>共 {filtered.length} 位客户</span>
          </div>

          <div className="master-table-scroll">
            <table className="master-table">
              <thead>
                <tr>
                  <th>客户名称</th>
                  <th>联系电话</th>
                  <th>电子邮箱</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((customer) => (
                  <tr key={customer.id}>
                    <td className="master-name">{customer.name}</td>
                    <td>{customer.phone || "—"}</td>
                    <td>{customer.email || "—"}</td>
                    <td>
                      <div className="master-row-actions">
                        <button onClick={() => startEdit(customer)}>
                          编辑
                        </button>
                        <button
                          className="master-danger-text"
                          onClick={() => handleDelete(customer)}
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
                {customers.length === 0
                  ? "暂无客户资料，请先添加客户"
                  : "没有符合条件的客户"}
              </div>
            )}
          </div>
        </section>

        <aside className="master-editor">
          <div className="master-editor-title">
            <h2>{editingId ? "编辑客户" : "新增客户"}</h2>
            <p>填写客户的基本资料</p>
          </div>

          <form onSubmit={handleSave} className="master-form">
            <label>
              客户名称 <span>*</span>
              <input
                value={form.name}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value })
                }
                placeholder="例如：ABC Trading Sdn. Bhd."
                required
              />
            </label>

            <label>
              联系电话
              <input
                type="tel"
                value={form.phone}
                onChange={(e) =>
                  setForm({ ...form, phone: e.target.value })
                }
                placeholder="例如：+60 12-345 6789"
              />
            </label>

            <label>
              电子邮箱
              <input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm({ ...form, email: e.target.value })
                }
                placeholder="customer@example.com"
              />
            </label>

            <label>
              客户地址
              <textarea
                rows={4}
                value={form.address}
                onChange={(e) =>
                  setForm({ ...form, address: e.target.value })
                }
                placeholder="填写客户地址"
              />
            </label>

            {error && <p className="master-error" role="alert">{error}</p>}
            {message && <p className="master-success" role="status">{message}</p>}

            <div className="master-form-actions">
              <button type="button" onClick={startNew}>
                清空
              </button>
              <button type="submit" className="master-primary">
                保存客户
              </button>
            </div>
          </form>
        </aside>
      </div>
    </div>
  );
}

export default Customers;
