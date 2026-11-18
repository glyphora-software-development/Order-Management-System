import { Link, useLocation } from "react-router-dom";

const menus = [
  { path: "/", label: "销售工作台", icon: "▦" },
  { path: "/orders/new", label: "新建订单", icon: "+" },
  { path: "/orders", label: "订单管理", icon: "≡" },
  { path: "/customers", label: "客户管理", icon: "♙" },
  { path: "/products", label: "商品管理", icon: "▤" },
  { path: "/reports", label: "业务报表", icon: "▥" },
  { path: "/demo", label: "演示工具", icon: "◇" },
];

export default function Sidebar({ onLogout, onNavigate }: { onLogout: () => void; onNavigate?: () => void }) {
  const { pathname: currentPath } = useLocation();
  const pathname = currentPath.replace(/\/+$/, "") || "/";
  return <aside className="sidebar">
    <div className="sidebar-brand">
      <div className="sidebar-brand-icon" aria-hidden="true">G</div>
      <div><strong>Glyphora</strong><span>ORDER MANAGEMENT</span></div>
    </div>
    <div className="sidebar-section-title">销售管理</div>
    <nav className="sidebar-menu" aria-label="主要导航">
      {menus.map((item) => {
        const active = pathname === item.path || (item.path === "/orders" && pathname.includes("/documents/"));
        return <Link key={item.path} to={item.path} aria-current={active ? "page" : undefined}
          className={"sidebar-menu-item" + (active ? " active" : "")} onClick={onNavigate}>
          <span className="sidebar-menu-icon" aria-hidden="true">{item.icon}</span>
          <span>{item.label}</span>
        </Link>;
      })}
    </nav>
    <div className="sidebar-spacer" />
    <div className="sidebar-footer">
      <button onClick={onLogout} type="button"><span aria-hidden="true">↪</span>退出演示</button>
      <small>© 2026 Glyphora</small>
    </div>
  </aside>;
}
