
import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  getOrders,
  formatMoney,
  statusLabels,
} from "../services/orderStorage";
import "./Dashboard.css";

function todayString(): string {
  const now = new Date();
  const local = new Date(
    now.getTime() - now.getTimezoneOffset() * 60000
  );
  return local.toISOString().slice(0, 10);
}

function Dashboard() {
  const { recentOrders, summary, counts } = useMemo(() => {
    const orders = getOrders();
    const today = todayString();

    const todayOrders = orders.filter((o) => o.date === today);
    // 销售额不含草稿和已取消的订单
    const todaySales = todayOrders
      .filter((o) => o.status !== "draft" && o.status !== "cancelled")
      .reduce((sum, o) => sum + o.total, 0);

    const counts = {
      draft: orders.filter((o) => o.status === "draft").length,
      pending: orders.filter((o) => o.status === "pending").length,
      processing: orders.filter((o) => o.status === "processing").length,
    };

    const recentOrders = [...orders]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5);

    const summary = [
      { label: "今日订单", value: String(todayOrders.length), note: "今日日期的订单" },
      { label: "待确认", value: String(counts.pending), note: "等待确认的订单" },
      { label: "处理中", value: String(counts.processing), note: "正在跟进" },
      { label: "今日销售额", value: formatMoney(todaySales), note: "不含草稿和已取消" },
    ];

    return { recentOrders, summary, counts };
  }, []);

  return (
    <div className="sales-dashboard">
      <div className="sales-page-heading">
        <div>
          <div className="sales-breadcrumb">
            销售管理 / 工作台
          </div>
          <h1>销售工作台</h1>
          <p>处理订单、维护客户和跟进日常销售业务</p>
        </div>

        <span className="sales-demo-label">
          本地演示数据
        </span>
      </div>

      <section className="sales-action-panel">
        <div className="sales-action-intro">
          <strong>快捷操作</strong>
          <span>选择需要执行的业务操作</span>
        </div>

        <div className="sales-action-buttons">
          <Link to="/orders/new" className="sales-action-primary">
            <span>＋</span> 新建销售订单
          </Link>
          <Link to="/orders" className="sales-action-secondary">
            查询订单
          </Link>
          <Link to="/customers" className="sales-action-secondary">
            客户资料
          </Link>
        </div>
      </section>

      <section className="sales-overview">
        {summary.map((item) => (
          <div className="sales-summary-item" key={item.label}>
            <span className="sales-summary-label">{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.note}</small>
          </div>
        ))}
      </section>

      <div className="sales-dashboard-grid">
        <section className="sales-panel">
          <div className="sales-panel-header">
            <div>
              <h2>最近订单</h2>
              <p>最近创建或更新的订单记录</p>
            </div>
            <Link to="/orders">全部订单 →</Link>
          </div>

          <div className="sales-table-wrapper">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>订单编号</th>
                  <th>客户名称</th>
                  <th>日期</th>
                  <th>金额</th>
                  <th>状态</th>
                </tr>
              </thead>

              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="sales-order-id">{order.id}</td>
                    <td>{order.customer}</td>
                    <td>{order.date}</td>
                    <td className="sales-money">
                      {formatMoney(order.total)}
                    </td>
                    <td>
                      <span className={`sales-status ${order.status}`}>
                        {statusLabels[order.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {recentOrders.length === 0 && (
            <div className="sales-panel-footer">
              暂无订单，<Link to="/orders/new">新建第一张订单</Link>
            </div>
          )}
          {recentOrders.length > 0 && (
            <div className="sales-panel-footer">
              显示最近 {recentOrders.length} 条订单
            </div>
          )}
        </section>

        <aside className="sales-side-panel">
          <div className="sales-panel-header">
            <div>
              <h2>工作提醒</h2>
              <p>需要关注的业务事项</p>
            </div>
          </div>

          <div className="sales-reminder">
            <span className="sales-reminder-indicator amber" />
            <div>
              <strong>{counts.pending} 笔订单待确认</strong>
              <p>请及时确认客户订单</p>
            </div>
          </div>

          <div className="sales-reminder">
            <span className="sales-reminder-indicator blue" />
            <div>
              <strong>{counts.processing} 笔订单处理中</strong>
              <p>查看订单的最新进度</p>
            </div>
          </div>

          <div className="sales-reminder">
            <span className="sales-reminder-indicator green" />
            <div>
              <strong>{counts.draft} 张草稿未提交</strong>
              <p>完善后可提交为待确认订单</p>
            </div>
          </div>

          <Link to="/orders" className="sales-side-link">
            前往订单管理 →
          </Link>
        </aside>
      </div>
    </div>
  );
}

export default Dashboard;
