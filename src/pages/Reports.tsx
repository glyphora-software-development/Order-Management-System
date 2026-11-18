import { useMemo, useState } from "react";
import { useCommerce } from "../components/commerceContext";
import { businessDate } from "../services/businessDate";
import { movementLabels } from "../services/commerceModel";
import { formatMinor, statusLabels } from "../services/orderModel";
import { buildReports, validReportRange } from "../services/reportModel";
import { ChartBars, EmptyState, PageHeader, TableScroll } from "../components/ui";
import { Pagination } from "../components/Pagination";
import { useListPage } from "../components/listPage";
import "./Reports.css";

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="report-metric"><span>{label}</span><strong>{value}</strong></div>;
}

export default function Reports() {
  const data = useCommerce();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const report = useMemo(() => {
    const range = { from, to };
    return validReportRange(range) ? buildReports(data, range) : undefined;
  }, [data, from, to]);
  const stockPage = useListPage(report?.inventory ?? [], "inventory");
  const movementsPage = useListPage(report?.movements ?? [], JSON.stringify([from, to]));
  const productById = useMemo(() => new Map(data.products.map((product) => [product.id, product])), [data.products]);

  return (
    <div className="reports-page">
      <PageHeader title="业务报表" description="销售、实际收款与库存概况 · MYR" />
      <section className="report-filter" aria-label="日期范围筛选">
        <label>开始日期<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>结束日期<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <button className="ui-button" type="button" onClick={() => { setFrom(""); setTo(""); }}>清除日期</button>
      </section>
      {!report ? <p className="orders-error" role="alert">日期无效，开始日期须早于或等于结束日期。</p> : <>
        <section className="report-panel" aria-labelledby="report-sales">
          <h2 id="report-sales">销售报表</h2>
          <p>按订单日期筛选。有效销售包括已确认、处理中、已发货和已完成订单。</p>
          <div className="report-metrics">
            <Metric label="有效销售额" value={formatMinor(report.salesMinor)} />
            <Metric label="订单总数" value={report.totalOrders} />
            <Metric label="有效销售订单" value={report.salesCount} />
          </div>
          <div className="report-chart-grid">
            <section>
              <h3>销售趋势</h3>
              {report.trend.length ? <ChartBars label="每日有效销售额" rows={report.trend.map((entry) => ({
                label: entry.date, value: entry.amountMinor, formatted: formatMinor(entry.amountMinor),
              }))} /> : <EmptyState title="此范围内没有有效销售。" />}
            </section>
            <section>
              <h3>订单状态分布</h3>
              {report.totalOrders ? <ChartBars label="订单状态数量" rows={report.statuses.map(({ status, count }) => ({
                label: statusLabels[status], value: BigInt(count), formatted: String(count),
              }))} /> : <EmptyState title="此范围内没有订单。" />}
            </section>
          </div>
          <h3>热销商品</h3>
          {report.topProducts.length ? <TableScroll label="热销商品明细"><table className="report-table">
            <thead><tr><th scope="col">商品</th><th scope="col">SKU 快照</th><th scope="col" className="ui-numeric">销售数量</th><th scope="col" className="ui-numeric">明细金额</th></tr></thead>
            <tbody>{report.topProducts.map((entry) => <tr key={entry.key}>
              <td>{entry.name}</td><td>{entry.sku ?? "—"}</td><td className="ui-numeric">{entry.quantity.toString()}</td><td className="ui-numeric">{formatMinor(entry.amountMinor)}</td>
            </tr>)}</tbody>
          </table></TableScroll> : <EmptyState title="此范围内没有商品销量。" />}
        </section>

        <section className="report-panel" aria-labelledby="report-payments">
          <h2 id="report-payments">付款报表</h2>
          <p>实际收款按付款日期。应收按订单日期选取有效订单，再扣除这些订单截至当前的全部实收。待核对订单单独列示。</p>
          <div className="report-metrics">
            <Metric label="实际收款总额" value={formatMinor(report.collectedMinor)} />
            <Metric label="未收款余额" value={formatMinor(report.balanceMinor)} />
            <Metric label="部分付款订单" value={report.partial} />
            <Metric label="未付款订单" value={report.unpaid} />
            <Metric label="历史付款待核对订单" value={report.needsReview} />
          </div>
        </section>

        <section className="report-panel" aria-labelledby="report-inventory">
          <h2 id="report-inventory">库存报表</h2>
          <p>当前库存不受日期筛选影响。变动流水按马来西亚当地日期筛选。</p>
          <div className="report-metrics">
            <Metric label="商品数" value={report.inventory.length} />
            <Metric label="低库存商品（含缺货）" value={report.lowCount} />
            <Metric label="库存未初始化" value={report.unknownCount} />
          </div>
          {report.inventory.length ? <TableScroll label="当前库存"><table className="report-table">
            <thead><tr><th scope="col">SKU</th><th scope="col">商品</th><th scope="col" className="ui-numeric">当前库存</th><th scope="col" className="ui-numeric">低库存阈值</th><th scope="col">库存状态</th></tr></thead>
            <tbody>{stockPage.rows.map(({ product, stock, status }) => <tr key={product.id}>
              <td>{product.sku}</td><td>{product.name}</td><td className="ui-numeric">{stock ?? "未记录"}</td><td className="ui-numeric">{product.lowStockThreshold}</td><td>{status}</td>
            </tr>)}</tbody>
          </table></TableScroll> : <EmptyState title="暂无库存商品。" />}
          <Pagination {...stockPage} count={report.inventory.length} />
          <h3>库存变动历史</h3>
          {report.movements.length ? <TableScroll label="库存变动历史"><table className="report-table">
            <thead><tr><th scope="col">日期</th><th scope="col">商品</th><th scope="col">类型</th><th scope="col" className="ui-numeric">变动量</th><th scope="col" className="ui-numeric">变动后</th><th scope="col">订单</th></tr></thead>
            <tbody>{movementsPage.rows.map((entry) => <tr key={entry.id}>
              <td>{businessDate(entry.createdAt)}</td><td>{productById.get(entry.productId)?.name ?? entry.productId}</td>
              <td>{movementLabels[entry.type]}</td><td className="ui-numeric">{entry.quantity}</td><td className="ui-numeric">{entry.newStock}</td><td>{entry.orderId ?? "—"}</td>
            </tr>)}</tbody>
          </table></TableScroll> : <EmptyState title="此范围内没有库存变动记录。" />}
          <Pagination {...movementsPage} count={report.movements.length} />
        </section>
      </>}
    </div>
  );
}
