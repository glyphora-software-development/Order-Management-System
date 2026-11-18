
import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { Customer } from "../services/masterDataStorage";
import { useCustomerDirectory } from "../components/useCustomerDirectory";
import { ConfirmDialog, EmptyState, PageHeader, TableScroll } from "../components/ui";
import { Pagination } from "../components/Pagination";
import { useListPage } from "../components/listPage";
import { useToast } from "../components/toastContext";
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
  const { customers, save, remove } = useCustomerDirectory();
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Customer>();
  const [nameError, setNameError] = useState("");
  const nameInput = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const filtered = customers.filter((customer) => {
    const query = search.trim().toLowerCase();
    return (
      customer.name.toLowerCase().includes(query) ||
      customer.phone.toLowerCase().includes(query) ||
      customer.email.toLowerCase().includes(query)
    );
  });

  const page = useListPage(filtered, search);

  function startNew(focus = false) {
    setEditingId(null);
    setForm({ ...emptyForm });
    setError("");
    setNameError("");
    if (focus) nameInput.current?.focus();
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
    setNameError("");
    nameInput.current?.focus();
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;

    if (!form.name.trim()) {
      setNameError("请输入客户名称");
      nameInput.current?.focus();
      return;
    }

    saving.current = true;
    setBusy(true);
    try {
      await save(
        {
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          address: form.address.trim(),
        },
        editingId ?? undefined
      );

      startNew();
      toast("客户资料已保存");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请检查本地存储");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  async function handleDelete(customer: Customer) {
    await remove(customer.id);
    if (editingId === customer.id) startNew();
    toast("客户已删除");
    setError("");
  }

  return (
    <div className="master-page">
      <PageHeader title="客户管理" description="维护公司客户资料和联系方式"
        actions={<button type="button" className="ui-button ui-button-primary" disabled={busy} onClick={() => startNew(true)}>＋ 新增客户</button>} />
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

          <TableScroll label="客户列表">
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
                {page.rows.map((customer) => (
                  <tr key={customer.id}>
                    <td className="master-name ui-ellipsis" title={customer.name}>{customer.name}</td>
                    <td>{customer.phone || "—"}</td>
                    <td className="ui-ellipsis" title={customer.email}>{customer.email || "—"}</td>
                    <td>
                      <div className="master-row-actions">
                        <Link to={"/orders?customer=" + encodeURIComponent(customer.id)}>历史订单</Link>
                        <button disabled={busy} onClick={() => startEdit(customer)}>
                          编辑
                        </button>
                        <button
                          className="master-danger-text"
                          disabled={busy}
                          onClick={() => setDeleteTarget(customer)}
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

          </TableScroll>
          {filtered.length === 0 && <EmptyState title={customers.length ? "没有符合条件的客户" : "暂无客户资料"}
            detail={customers.length ? "试着搜索客户名称、电话或邮箱。" : "可从表单添加客户。"} />}
          <Pagination {...page} count={filtered.length} />
        </section>

        <aside className="master-editor">
          <div className="master-editor-title">
            <h2>{editingId ? "编辑客户" : "新增客户"}</h2>
            <p>填写客户的基本资料</p>
          </div>

          <form onSubmit={handleSave} className="master-form">
            <label>
              <span>客户名称 <span className="ui-required" aria-hidden="true">*</span></span>
              <input
                ref={nameInput}
                value={form.name}
                aria-invalid={Boolean(nameError)}
                aria-describedby={nameError ? "customer-name-error" : undefined}
                onChange={(e) => { setNameError(""); setForm({ ...form, name: e.target.value }); }}
                placeholder="例如：ABC Trading Sdn. Bhd."
                required
              />
              {nameError && <small id="customer-name-error" className="ui-field-error" role="alert">{nameError}</small>}
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

            {error && <p className="ui-feedback ui-feedback-error" role="alert">{error}</p>}

            <div className="master-form-actions">
              <button className="ui-button" type="button" disabled={busy} onClick={() => startNew()}>
                清空
              </button>
              <button type="submit" className="master-primary" disabled={busy}>
                保存客户
              </button>
            </div>
          </form>
        </aside>
      </div>
      {deleteTarget && <ConfirmDialog title="删除客户" detail={"确定删除「" + deleteTarget.name + "」？历史订单会保留原客户快照。"}
        confirmLabel="确认删除" onClose={() => setDeleteTarget(undefined)} onConfirm={() => handleDelete(deleteTarget)} />}
    </div>
  );
}

export default Customers;
