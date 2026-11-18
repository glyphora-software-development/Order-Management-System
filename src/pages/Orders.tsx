
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  paymentLabels,
  availableStatuses,
  isEditable,
  statusLabels,
  formatMinor,
  isSubmitted,
  sortLabels,
  sortOrders,
  type OrderSort,
  type SalesOrder,
  type OrderStatus,
} from "../services/orderStorage";
import { useCustomerDirectory } from "../components/useCustomerDirectory";
import OrderPayments from "../components/OrderPayments";
import { useCommerce } from "../components/commerceContext";
import { commerce } from "../services/commerceClient";
import { needsPaymentReview, paymentSummary, stockForOrder, transitionError } from "../services/commerceModel";
import { ConfirmDialog, EmptyState, OrderBadge, PageHeader, TableScroll } from "../components/ui";
import { Pagination } from "../components/Pagination";
import { useListPage } from "../components/listPage";
import { useToast } from "../components/toastContext";
import "./Orders.css";

function orderStatusLabel(order: SalesOrder) {
  return isSubmitted(order) ? "草稿 · 待确认" : statusLabels[order.status];
}

function Orders() {
  const [params, setParams] = useSearchParams();
  const customerId = params.get("customer");
  const { customers } = useCustomerDirectory();
  const customer = customerId ? customers.find((entry) => entry.id === customerId) : undefined;
  const { orders, payments, movements } = useCommerce();
  const [sort, setSort] = useState<OrderSort>("newest");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const selectedId = params.get("order");
  const [error, setError] = useState("");
  const [cancelOrderId, setCancelOrderId] = useState<string>();
  const detail = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const statusPending = useRef(false);
  const toast = useToast();
  useEffect(() => {
    if (selectedId) detail.current?.focus({ preventScroll: !window.matchMedia("(max-width: 1150px)").matches });
  }, [selectedId]);

  const filteredOrders = useMemo(() => {
    return sortOrders(orders.filter((order) => {
      const matchesSearch =
        order.id.toLowerCase().includes(search.toLowerCase()) ||
        order.customer.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || order.status === statusFilter ||
        (statusFilter === "submitted" && isSubmitted(order));

      return matchesSearch && matchesStatus && (!customerId || order.customerId === customerId);
    }), sort);
  }, [orders, search, statusFilter, customerId, sort]);

  const page = useListPage(filteredOrders, JSON.stringify([search, sort, statusFilter, customerId]));
  const selectedOrder =
    orders.find((order) => order.id === selectedId) ?? null;

  const [changingStatus, setChangingStatus] = useState(false);

  function statusOptions(order: SalesOrder) {
    return availableStatuses(order).filter((status) => !transitionError(order, status, payments));
  }

  function showOrder(id: string, button: HTMLElement) {
    trigger.current = button;
    setError("");
    if (id === selectedId) {
      detail.current?.focus();
      return;
    }
    const next = new URLSearchParams(params);
    next.set("order", id);
    setParams(next);
  }

  function closeOrder() {
    const next = new URLSearchParams(params);
    next.delete("order");
    setParams(next, { replace: true });
    trigger.current?.focus();
  }

  async function changeStatus(id: string, status: OrderStatus) {
    if (statusPending.current) return;
    if (status === "cancelled") {
      setCancelOrderId(id);
      return;
    }
    statusPending.current = true;
    setChangingStatus(true);
    try {
      await commerce.updateOrderStatus(id, status);
      setError("");
      toast("订单已更新为" + statusLabels[status]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "订单状态更新失败");
    } finally {
      statusPending.current = false;
      setChangingStatus(false);
    }
  }

  return (
    <div className="orders-page">
      <PageHeader title="订单管理" description="查询、查看和处理销售订单"
        actions={<Link to="/orders/new" className="ui-button ui-button-primary">＋ 新建订单</Link>} />

      {customerId && (
        <p>{customer?.name ?? "客户"}的历史订单 · <Link to="/orders">查看全部订单</Link></p>
      )}

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
          <option value="submitted">待确认草稿</option>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <select aria-label="订单排序" value={sort} onChange={(event) => setSort(event.target.value as OrderSort)}>
          {Object.entries(sortLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        <span className="orders-count">
          共 {filteredOrders.length} 笔订单
        </span>
      </div>

      <div className="orders-layout">
        <section className="orders-list-panel">
          <TableScroll label="订单列表">
            <table className="orders-data-table">
              <thead>
                <tr>
                  <th>订单编号</th>
                  <th>客户名称</th>
                  <th>订单日期</th>
                  <th className="ui-numeric">金额</th>
                  <th>订单状态</th>
                  <th>付款状态</th>
                  <th>操作</th>
                </tr>
              </thead>

              <tbody>
                {page.rows.map((order) => (
                  <tr
                    key={order.id}
                    className={
                      selectedId === order.id ? "selected" : ""
                    }
                  >
                    <td className="orders-id"><button type="button" className="ui-link-button" onClick={(event) => showOrder(order.id, event.currentTarget)}>{order.id}</button></td>
                    <td className="ui-ellipsis" title={order.customer}>{order.customer}</td>
                    <td>{order.date}</td>
                    <td className="orders-money ui-numeric">
                      {formatMinor(order.totalMinor)}
                    </td>
                    <td><OrderBadge order={order} /></td>
                    <td>{needsPaymentReview(order) ? "历史资料待核对" : paymentLabels[paymentSummary(order, payments).status]}</td>
                    <td>
                      <button
                        type="button"
                        className="orders-view-button"
                        onClick={(event) => showOrder(order.id, event.currentTarget)}
                      >
                        查看
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

          </TableScroll>
          {filteredOrders.length === 0 && <EmptyState title={orders.length ? "没有符合条件的订单" : "暂无订单"}
            detail={orders.length ? "试着更改搜索词或筛选条件。" : "创建销售订单后，订单会显示在这里。"} />}
          <Pagination {...page} count={filteredOrders.length} />
        </section>

        {selectedOrder && (
          <aside className="orders-detail-panel" ref={detail} tabIndex={-1} aria-label="订单详情">
            <div className="orders-detail-heading">
              <div>
                <h2>订单详情</h2>
                <span>{selectedOrder.id}</span>
              </div>

              <button
                type="button"
                onClick={closeOrder}
                className="ui-icon-button"
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
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "order-status-error" : undefined}
                  disabled={changingStatus || statusOptions(selectedOrder).length === 0}
                  value={selectedOrder.status}
                  onChange={(e) =>
                    changeStatus(
                      selectedOrder.id,
                      e.target.value as OrderStatus
                    )
                  }
                >
                  <option value={selectedOrder.status}>{orderStatusLabel(selectedOrder)}</option>
                  {statusOptions(selectedOrder).map((status) => (
                    <option key={status} value={status}>{statusLabels[status]}</option>
                  ))}
                </select>
              </div>

              {error && <p id="order-status-error" className="orders-error" role="alert">{error}</p>}
              <div className="orders-detail-field">
                <span>库存处理</span>
                <strong>{stockForOrder(selectedOrder, movements)}</strong>
              </div>
              {selectedOrder.status === "shipped" && !statusOptions(selectedOrder).includes("completed") && (
                <p className="orders-detail-remarks">须核对历史付款并结清余额后完成订单。</p>
              )}
              {availableStatuses(selectedOrder).includes("cancelled") &&
                !statusOptions(selectedOrder).includes("cancelled") && (
                  <p className="orders-detail-remarks">有待核对或已登记的付款，当前无法普通取消。</p>
              )}
              <OrderPayments key={selectedOrder.id} order={selectedOrder} ledger={payments} />
              {selectedOrder.cancellationReason && (
                <p className="orders-detail-remarks">取消原因：{selectedOrder.cancellationReason}</p>
              )}
              <div className="order-heading-actions">
                {isEditable(selectedOrder) && (
                  <Link to={"/orders/new?edit=" + encodeURIComponent(selectedOrder.id)}>编辑订单</Link>
                )}
                <Link to={"/orders/new?copy=" + encodeURIComponent(selectedOrder.id)}>复制订单</Link>
              </div>
              <nav className="order-heading-actions document-links" aria-label="订单单据">
                <Link className="ui-button" to={"/orders/" + encodeURIComponent(selectedOrder.id) + "/documents/invoice"}>查看 Invoice</Link>
                <Link className="ui-button" to={"/orders/" + encodeURIComponent(selectedOrder.id) + "/documents/delivery"}>查看 Delivery Order</Link>
              </nav>
              <h3>状态时间线</h3>
              {selectedOrder.legacy && (
                <p className="orders-detail-remarks">
                  从 V1 迁入 · 原状态：{selectedOrder.legacy.status === "pending"
                    ? "待确认"
                    : statusLabels[selectedOrder.legacy.status]}
                </p>
              )}
              {selectedOrder.events.length ? (
                <ol className="orders-timeline">
                  {selectedOrder.events.map((event, index) => (
                    <li key={index}>
                      <strong>{statusLabels[event.status]}</strong>
                      <time dateTime={event.at}>{new Date(event.at).toLocaleString("zh-MY", { timeZone: "Asia/Kuala_Lumpur" })}</time>
                      {event.cancellationReason && <span>{event.cancellationReason}</span>}
                    </li>
                  ))}
                </ol>
              ) : <p className="orders-detail-remarks">暂无已记录的状态事件。</p>}
              <h3>商品明细</h3>

              {selectedOrder.items.map((item) => (
                <div className="orders-detail-item" key={item.id}>
                  <strong>{item.name}</strong>
                  <span>
                    {item.quantity} × {formatMinor(item.priceMinor)}
                  </span>
                  <b>
                    {formatMinor(item.quantity * item.priceMinor)}
                  </b>
                </div>
              ))}

              <div className="orders-detail-total">
                <span>订单总额</span>
                <strong>{formatMinor(selectedOrder.totalMinor)}</strong>
              </div>

              <h3>备注</h3>
              <p className="orders-detail-remarks">
                {selectedOrder.remarks || "无备注"}
              </p>
            </div>
          </aside>
        )}
      </div>
      {cancelOrderId && <ConfirmDialog title="取消订单" detail={"取消 " + cancelOrderId + " 并记录原因。已扣减的库存会按订单流水恢复。"}
        confirmLabel="确认取消订单" reasonRequired onClose={() => setCancelOrderId(undefined)}
        onConfirm={async (reason) => {
          await commerce.updateOrderStatus(cancelOrderId, "cancelled", reason);
          setError("");
          toast("订单已取消");
        }} />}
    </div>
  );
}

export default Orders;
