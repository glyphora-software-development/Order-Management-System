import "./Login.css";

export default function Login({ onLogin }: { onLogin: (name: string) => void }) {
  return (
    <div className="login-page">
      <section className="login-brand">
        <div className="login-brand-name"><div className="brand-symbol" aria-hidden="true">G</div><span>Glyphora</span></div>
        <div className="login-brand-content">
          <div className="brand-overline">ORDER MANAGEMENT SYSTEM</div>
          <h1>销售运营工作台</h1>
          <p>从客户和商品建档，到开单、库存扣减、付款、发货与报表。</p>
        </div>
        <div className="brand-footer">© 2026 Glyphora Software Development</div>
      </section>

      <section className="login-form-section">
        <div className="login-form-container">
          <div className="login-app-icon" aria-hidden="true">G</div>
          <div className="login-heading">
            <h2>Portfolio Demo</h2>
            <p>体验 Glyphora OMS 的完整订单流程。进入演示无需员工账号或密码。</p>
          </div>
          <button type="button" className="login-submit" onClick={() => onLogin("演示访客")}>
            进入演示 <span aria-hidden="true">→</span>
          </button>
          <div className="login-notice">
            演示使用虚构的客户与交易资料。数据保存在此站点的当前浏览器配置中。
            首次进入空工作区会生成示例资料，已有 OMS 数据会保留。请使用虚构资料体验。
          </div>
        </div>
        <div className="login-bottom">Glyphora OMS · Portfolio Demo</div>
      </section>
    </div>
  );
}
