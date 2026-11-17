
import { NavLink } from "react-router-dom";

interface SidebarProps {
  onLogout: () => void;
}

const menus = [
  { path: "/", label: "销售工作台", icon: "▦", end: true },
  { path: "/orders/new", label: "新建订单", icon: "+", end: false },
  { path: "/orders", label: "订单管理", icon: "≡", end: true },
  { path: "/customers", label: "客户管理", icon: "♙", end: false },
  { path: "/products", label: "商品管理", icon: "▤", end: false },
];

function Sidebar({ onLogout }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">G</div>
        <div>
          <strong>Glyphora</strong>
          <span>ORDER MANAGEMENT</span>
        </div>
      </div>

      <div className="sidebar-section-title">
        SALES WORKSPACE
      </div>

      <nav className="sidebar-menu">
        {menus.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            className={({ isActive }) =>
              `sidebar-menu-item ${isActive ? "active" : ""}`
            }
          >
            <span className="sidebar-menu-icon">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-spacer" />

      <div className="sidebar-footer">
        <button onClick={onLogout} type="button">
          <span>↪</span>
          退出登录
        </button>
        <small>© 2026 Glyphora</small>
      </div>
    </aside>
  );
}

export default Sidebar;
