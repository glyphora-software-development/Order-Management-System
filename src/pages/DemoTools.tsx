import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCommerce } from "../components/commerceContext";
import { useToast } from "../components/toastContext";
import { ConfirmDialog, PageHeader } from "../components/ui";
import { resetDemo } from "../services/commerceClient";
import { canResetDemo } from "../services/demoLifecycle";
import "./DemoTools.css";

export default function DemoTools() {
  const data = useCommerce();
  const toast = useToast();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);

  return <div className="demo-tools">
    <PageHeader title="演示工具" description="Glyphora Software Development · Portfolio Demo" />
    <section className="ui-card demo-panel" aria-labelledby="demo-workspace">
      <h2 id="demo-workspace">当前浏览器工作区</h2>
      {data.demo ? <>
        <p>这是演示工作区。请使用虚构资料，重置会替换此工作区内的示例资料及您在演示中做的变更。</p>
        <dl className="demo-counts">
          <div><dt>客户</dt><dd>{data.demo.customers.length}</dd></div>
          <div><dt>商品</dt><dd>{data.products.filter((product) => !product.archived).length}</dd></div>
          <div><dt>订单</dt><dd>{data.orders.length}</dd></div>
          <div><dt>付款记录</dt><dd>{data.payments.length}</dd></div>
        </dl>
      </> : <p role="status">检测到已有本地资料。工作区已进入保护模式，演示重置不可用。</p>}
      <p>资料保存在此站点的当前浏览器配置中。重置保留历史迁移备份。</p>
      {canResetDemo(data) && <button type="button" className="ui-button ui-button-danger" onClick={() => setConfirming(true)}>
        重置演示数据
      </button>}
    </section>
    <section className="ui-card demo-panel" aria-labelledby="demo-guide">
      <h2 id="demo-guide">体验一笔订单</h2>
      <ol>
        <li>在<Link to="/customers">客户管理</Link>选择客户，在<Link to="/products">商品管理</Link>查看可用库存。</li>
        <li><Link to="/orders/new">创建订单</Link>并提交。确认订单后查看扣减的库存。</li>
        <li>登记部分付款，将订单变更为处理中并发货，补齐余额后完成订单。</li>
        <li>在订单详情查看 Invoice 与 Delivery Order，再查看<Link to="/reports">业务报表</Link>。</li>
      </ol>
    </section>
    {confirming && <ConfirmDialog title="重置演示数据"
      detail="此操作会替换当前浏览器中本演示工作区的客户、商品、订单、付款和库存记录，包括您在演示中新增或修改的资料。历史迁移备份会保留。"
      confirmLabel="确认重置" onClose={() => setConfirming(false)} onConfirm={async () => {
        await resetDemo();
        toast("演示数据已恢复");
        navigate("/");
      }} />}
  </div>;
}
