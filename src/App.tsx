import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import CommerceProvider from "./components/CommerceProvider";
import ToastProvider from "./components/ToastProvider";
import { Modal } from "./components/ui";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import NewOrder from "./pages/NewOrder";
import Orders from "./pages/Orders";
import Customers from "./pages/Customers";
import Products from "./pages/Products";
import Documents from "./pages/Documents";
import Reports from "./pages/Reports";
import DemoTools from "./pages/DemoTools";

import "./App.css";
import "./ui.css";

function Workspace({ employee, logout }: { employee: string; logout: () => void }) {
  const { pathname: currentPath, search } = useLocation();
  const pathname = currentPath.replace(/\/+$/, "") || "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const content = useRef<HTMLElement>(null);
  const location = pathname === "/" ? "销售工作台" : pathname === "/orders/new" ? "新建订单"
    : pathname.startsWith("/orders/") ? "订单单据" : pathname === "/orders" ? "订单管理"
    : pathname === "/products" ? "商品管理" : pathname === "/customers" ? "客户管理" : pathname === "/demo" ? "演示工具" : "业务报表";

  useEffect(() => {
    if (pathname === "/orders" && new URLSearchParams(search).has("order")) return;
    content.current?.scrollTo(0, 0);
  }, [pathname, search]);

  useEffect(() => {
    if (!menuOpen) return;
    const desktop = window.matchMedia("(min-width: 901px)");
    function closeOnDesktop(event: MediaQueryListEvent) {
      if (event.matches) setMenuOpen(false);
    }
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, [menuOpen]);

  return <div className="app">
    <ToastProvider>
      <a className="ui-button skip-workspace" href="#workspace-main">跳到主要内容</a>
      <Sidebar onLogout={logout} />
      <div className="workspace">
        <header className="workspace-topbar">
          <div className="workspace-identity">
            <button type="button" className="ui-icon-button workspace-menu-button" aria-label="打开导航"
              aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>☰</button>
            <span className="workspace-product">Glyphora OMS</span>
            <span className="workspace-separator" aria-hidden="true">/</span>
            <span className="workspace-location">{location}</span>
          </div>
          <div className="workspace-employee">
            <span className="ui-badge workspace-demo">演示环境</span>
            <span className="workspace-avatar" aria-hidden="true">{Array.from(employee)[0]?.toUpperCase() ?? "G"}</span>
            <span className="workspace-employee-name" title={employee}>{employee}</span>
          </div>
        </header>
        <main className="workspace-content" id="workspace-main" ref={content} tabIndex={-1}>
          <CommerceProvider>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/orders/new" element={<NewOrder />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/orders/:orderId/documents/:kind" element={<Documents />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/products" element={<Products />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/demo" element={<DemoTools />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </CommerceProvider>
        </main>
      </div>
      {menuOpen && <Modal title="工作区导航" className="mobile-menu" onClose={() => setMenuOpen(false)}>
        <Sidebar onLogout={logout} onNavigate={() => setMenuOpen(false)} />
      </Modal>}
    </ToastProvider>
  </div>;
}

const DEMO_SESSION_KEY = "glyphora-oms-demo-session";

function hasDemoSession(): boolean {
  try {
    return sessionStorage.getItem(DEMO_SESSION_KEY) === "active";
  } catch {
    return false;
  }
}

function App() {
  const [entered, setEntered] = useState(hasDemoSession);

  function updateDemoSession(active: boolean) {
    try {
      if (active) sessionStorage.setItem(DEMO_SESSION_KEY, "active");
      else sessionStorage.removeItem(DEMO_SESSION_KEY);
    } catch {
      // In-memory entry still works if session storage is unavailable.
    }
    setEntered(active);
  }

  return <BrowserRouter>
    {entered
      ? <Workspace employee="演示访客" logout={() => updateDemoSession(false)} />
      : <Login onLogin={() => updateDemoSession(true)} />}
  </BrowserRouter>;
}

export default App;
