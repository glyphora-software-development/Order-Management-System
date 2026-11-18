import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useCommerce } from "../components/commerceContext";
import { ChartBars, EmptyState, OrderBadge, PageHeader, TableScroll } from "../components/ui";
import { paymentMethods } from "../services/commerceModel";
import { dashboardOverview } from "../services/dashboardOverview";
import { formatMinor, statusLabels } from "../services/orderModel";
import "./Dashboard.css";

function DashboardPanel({ title, caption, action, children }: {
  title: string; caption?: string; action?: ReactNode; children: ReactNode;
}) {
  return <section className="ui-card dashboard-panel">
    <header className="dashboard-panel-heading">
      <div><h2>{title}</h2>{caption && <p>{caption}</p>}</div>
      {action}
    </header>
    {children}
  </section>;
}

function orderLink(id: string) { return "/orders?order=" + encodeURIComponent(id); }

function SalesTrend({ items }: { items: { date: string; amountMinor: bigint }[] }) {
  const visible = items.slice(-12);
  if (!visible.length) return <EmptyState title="暂无销售趋势" detail="确认订单后将在这里显示销售额。" />;
  const max = visible.reduce((largest, item) => item.amountMinor > largest ? item.amountMinor : largest, 0n);
  const values = visible.map(({ amountMinor, date }) => ({
    date, value: amountMinor, height: max > 0n ? Number(amountMinor * 1000n / max) / 10 : 0,
  }));
  return <>
    <div className="dashboard-trend" aria-hidden="true">
      <div className="dashboard-trend-axis"><span>{formatMinor(max)}</span><span>{formatMinor(0)}</span></div>
      <div className="dashboard-trend-body">
        <div className="dashboard-trend-columns">
          {values.map(({ date, value, height }) => <div key={date} className="dashboard-trend-column" title={date + " · " + formatMinor(value)}>
            <i style={{ height: height + "%" }} />
          </div>)}
        </div>
        <div className="dashboard-trend-dates"><span>{values[0].date}</span>{values.length > 1 && <span>{values.at(-1)?.date}</span>}</div>
      </div>
    </div>
    <details className="dashboard-trend-data">
      <summary>查看每日销售数据</summary>
      <ul>{values.map(({ date, value }) => <li key={date}><time dateTime={date}>{date}</time><strong>{formatMinor(value)}</strong></li>)}</ul>
    </details>
  </>;
}

export default function Dashboard() {
  const data = useCommerce();
  const overview = useMemo(() => dashboardOverview(data), [data]);
  const { report, pending, recentOrders, attention, lowStock, recentPayments } = overview;
  const metrics = [
    { label: "有效销售额", value: formatMinor(report.salesMinor), note: "按订单日期", icon: "↗", tone: "blue" },
    { label: "订单总数", value: report.totalOrders, note: report.salesCount + " 笔有效销售", icon: "≡", tone: "blue" },
    { label: "待确认订单", value: pending, note: "已提交的草稿", icon: "◷", tone: "amber" },
    { label: "未收款余额", value: formatMinor(report.balanceMinor), note: report.needsReview + " 笔历史付款待核对", icon: "◫", tone: "amber" },
    { label: "实际收款", value: formatMinor(report.collectedMinor), note: "按付款日期记录", icon: "✓", tone: "green" },
    { label: "低库存商品", value: report.lowCount, note: "含缺货，库存未初始化另列", icon: "◇", tone: "amber" },
  ];

  return <div className="sales-dashboard dashboard-page">
    <PageHeader title="销售工作台" description="全部历史 · MYR · 日期以马来西亚时间为准"
      actions={<><Link className="ui-button" to="/reports">查看报表</Link>
        <Link className="ui-button ui-button-primary" to="/orders/new">＋ 新建销售订单</Link></>} />
    <section className="dashboard-kpis" aria-label="业务指标">
      {metrics.map(({ label, value, note, icon, tone }) => (
        <article className="ui-card dashboard-kpi" key={label}>
          <div><span className="dashboard-kpi-label">{label}</span><span className={"dashboard-kpi-icon " + tone} aria-hidden="true">{icon}</span></div>
          <strong>{value}</strong><small>{note}</small>
        </article>
      ))}
    </section>

    <div className="dashboard-primary-grid">
      <DashboardPanel title="销售趋势" caption="最近 12 个有销售的订单日期">
        <SalesTrend items={report.trend} />
      </DashboardPanel>
      <DashboardPanel title="订单状态分布" caption="按当前状态统计全部订单">
        {report.totalOrders ? <ChartBars label="订单状态数量" rows={report.statuses.map(({ status, count }) => ({
          label: statusLabels[status], value: BigInt(count), formatted: count + " 笔",
        }))} /> : <EmptyState title="暂无订单分布" detail="新订单会按当前状态统计。" />}
      </DashboardPanel>
    </div>

    <div className="dashboard-primary-grid">
      <DashboardPanel title="最近订单" action={<Link className="dashboard-panel-link" to="/orders">全部订单 →</Link>}>
        {recentOrders.length ? <TableScroll label="最近订单">
          <table className="ui-table dashboard-order-table">
            <thead><tr><th scope="col">订单编号</th><th scope="col">客户</th><th scope="col">订单日期</th><th className="ui-numeric" scope="col">金额</th><th scope="col">状态</th></tr></thead>
            <tbody>{recentOrders.map((order) => <tr key={order.id}>
              <td><Link to={orderLink(order.id)}>{order.id}</Link></td>
              <td className="ui-ellipsis" title={order.customer}>{order.customer}</td>
              <td>{order.date}</td><td className="ui-numeric">{formatMinor(order.totalMinor)}</td><td><OrderBadge order={order} /></td>
            </tr>)}</tbody>
          </table>
        </TableScroll> : <EmptyState title="暂无订单" detail="创建销售订单后，最近的订单会显示在这里。"
          action={<Link className="ui-button" to="/orders/new">创建订单</Link>} />}
      </DashboardPanel>
      <DashboardPanel title="需要关注的订单">
        {attention.length ? <ul className="dashboard-records">
          {attention.map(({ order, label, tone }) => <li key={order.id}>
            <div><Link to={orderLink(order.id)}>{order.id}</Link><small title={order.customer}>{order.customer}</small></div>
            <span className={"ui-badge ui-status-" + tone}>{label}</span>
          </li>)}
        </ul> : <EmptyState title="暂无待跟进订单" />}
      </DashboardPanel>
    </div>

    <div className="dashboard-detail-grid">
      <DashboardPanel title="热销商品" caption="按有效订单销售数量排名">
        {report.topProducts.length ? <ChartBars label="热销商品数量" rows={report.topProducts.slice(0, 5).map((item) => ({
          label: item.name, value: item.quantity, formatted: item.quantity.toString() + " 件",
        }))} /> : <EmptyState title="暂无商品销量" />}
      </DashboardPanel>
      <DashboardPanel title="低库存提醒" action={<Link className="dashboard-panel-link" to="/products">商品管理 →</Link>}>
        {lowStock.length ? <ul className="dashboard-records">
          {lowStock.map(({ product, status }) => <li key={product.id}>
            <div><strong title={product.name}>{product.name}</strong><small>{product.sku} · 阈值 {product.lowStockThreshold}</small></div>
            <span className={"ui-badge ui-status-" + (product.currentStock === 0 ? "danger" : "warning")}>{status} · {product.currentStock}</span>
          </li>)}
        </ul> : <EmptyState title="暂无低库存提醒" detail={report.unknownCount ? report.unknownCount + " 件商品尚未初始化库存。" : undefined} />}
      </DashboardPanel>
      <DashboardPanel title="最近收款" caption="按登记时间排序，显示付款日期">
        {recentPayments.length ? <ul className="dashboard-records">
          {recentPayments.map((payment) => <li key={payment.id}>
            <div><Link to={orderLink(payment.orderId)}>{payment.orderId}</Link><small>{payment.date} · {paymentMethods[payment.method]}</small></div>
            <strong className="dashboard-payment">{formatMinor(payment.amountMinor)}</strong>
          </li>)}
        </ul> : <EmptyState title="暂无付款记录" detail="登记付款后会在这里显示。" />}
      </DashboardPanel>
    </div>
  </div>;
}
