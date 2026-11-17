
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getOrders,
  updateOrderStatus,
  statusLabels,
  formatMoney,
  type SalesOrder,
  type OrderStatus,
} from "../services/orderStorage";
import "./Orders.css";

function Orders() {
  const [orders, setOrders] = useState<SalesOrder[]>(getOrders);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        order.id.toLowerCase().includes(search.toLowerCase()) ||
        order.customer.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || order.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [orders, search, statusFilter]);

  const selectedOrder =
    orders.find((order) => order.id === selectedId) ?? null;

  function changeStatus(id: string, status: OrderStatus) {
    try {
      updateOrderStatus(id, status);
      setOrders(getOrders());
      setError("");
    } catch {
      setError("状态更新失败，本地数据未能保存");
    }
  }

  return (
    <div className="orders-page">
      <div className="orders-page-header">
        <div>
          <div className="sales-breadcrumb">
            销售管理 / 订单管理
          </div>
          <h1>订单管理</h1>
          <p>查询、查看和处理销售订单</p>
        </div>

        <Link to="/orders/new" className="orders-new-button">
          + 新建订单
        </Link>
      </div>

      <div className="orders-toolbar">
        <input
          type="search"
          placeholder="搜索订单编号或客户名称"
          aria-label="搜索订单"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          aria-label="按订单状态筛选"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">全部状态</option>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <span className="orders-count">
          共 {filteredOrders.length} 笔订单
        </span>
      </div>

      {error && (
        <p className="orders-error" role="alert">{error}</p>
      )}

      <div className="orders-layout">
        <section className="orders-list-panel">
          <div className="orders-table-scroll">
            <table className="orders-data-table">
              <thead>
                <tr>
                  <th>订单编号</th>
                  <th>客户名称</th>
                  <th>订单日期</th>
                  <th>金额</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>

              <tbody>
                {filteredOrders.map((order) => (
                  <tr
                    key={order.id}
                    className={
                      selectedId === order.id ? "selected" : ""
                    }
                  >
                    <td className="orders-id">{order.id}</td>
                    <td>{order.customer}</td>
                    <td>{order.date}</td>
                    <td className="orders-money">
                      {formatMoney(order.total)}
                    </td>
                    <td>
                      <span
                        className={`orders-status ${order.status}`}
                      >
                        {statusLabels[order.status]}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="orders-view-button"
                        onClick={() => setSelectedId(order.id)}
                      >
                        查看
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredOrders.length === 0 && (
              <div className="orders-empty">
                {orders.length === 0
                  ? "暂无订单，请先创建销售订单"
                  : "没有符合条件的订单"}
              </div>
            )}
          </div>
        </section>

        {selectedOrder && (
          <aside className="orders-detail-panel">
            <div className="orders-detail-heading">
              <div>
                <h2>订单详情</h2>
                <span>{selectedOrder.id}</span>
              </div>

              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="关闭订单详情"
              >
                ×
              </button>
            </div>

            <div className="orders-detail-body">
              <div className="orders-detail-field">
                <span>客户名称</span>
                <strong>{selectedOrder.customer}</strong>
              </div>

              <div className="orders-detail-field">
                <span>订单日期</span>
                <strong>{selectedOrder.date}</strong>
              </div>

              <div className="orders-detail-field">
                <label htmlFor="order-status-select">
                  订单状态
                </label>

                <select
                  id="order-status-select"
                  value={selectedOrder.status}
                  onChange={(e) =>
                    changeStatus(
                      selectedOrder.id,
                      e.target.value as OrderStatus
                    )
                  }
                >
                  {Object.entries(statusLabels).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    )
                  )}
                </select>
              </div>

              <h3>商品明细</h3>

              {selectedOrder.items.map((item) => (
                <div className="orders-detail-item" key={item.id}>
                  <strong>{item.name}</strong>
                  <span>
                    {item.quantity} × {formatMoney(item.price)}
                  </span>
                  <b>
                    {formatMoney(item.quantity * item.price)}
                  </b>
                </div>
              ))}

              <div className="orders-detail-total">
                <span>订单总额</span>
                <strong>{formatMoney(selectedOrder.total)}</strong>
              </div>

              <h3>备注</h3>
              <p className="orders-detail-remarks">
                {selectedOrder.remarks || "无备注"}
              </p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

export default Orders;
