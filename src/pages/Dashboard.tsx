
import { Link } from "react-router-dom";
import "./Dashboard.css";

const orders = [
  {
    id: "ORD-1001",
    customer: "Alex Tan",
    date: "2026-11-17",
    amount: "RM 250.00",
    status: "已完成",
    tone: "completed",
  },
  {
    id: "ORD-1002",
    customer: "Sarah Lee",
    date: "2026-11-17",
    amount: "RM 480.00",
    status: "待处理",
    tone: "pending",
  },
  {
    id: "ORD-1003",
    customer: "Jason Wong",
    date: "2026-11-16",
    amount: "RM 120.00",
    status: "处理中",
    tone: "processing",
  },
  {
    id: "ORD-1004",
    customer: "Emily Lim",
    date: "2026-11-16",
    amount: "RM 560.00",
    status: "已完成",
    tone: "completed",
  },
];

const summary = [
  { label: "今日订单", value: "12", note: "今日创建订单" },
  { label: "待处理", value: "24", note: "等待处理的订单" },
  { label: "处理中", value: "8", note: "正在跟进" },
  { label: "今日销售额", value: "RM 3,420", note: "今日销售金额" },
];

function Dashboard() {
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
          演示数据
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
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td className="sales-order-id">{order.id}</td>
                    <td>{order.customer}</td>
                    <td>{order.date}</td>
                    <td className="sales-money">{order.amount}</td>
                    <td>
                      <span className={`sales-status ${order.tone}`}>
                        {order.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sales-panel-footer">
            共显示 {orders.length} 条订单
          </div>
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
              <strong>24 笔订单待处理</strong>
              <p>请及时确认客户订单</p>
            </div>
          </div>

          <div className="sales-reminder">
            <span className="sales-reminder-indicator blue" />
            <div>
              <strong>8 笔订单处理中</strong>
              <p>查看订单的最新进度</p>
            </div>
          </div>

          <div className="sales-reminder">
            <span className="sales-reminder-indicator green" />
            <div>
              <strong>订单资料维护</strong>
              <p>核对订单信息与客户资料</p>
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
