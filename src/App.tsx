
import { useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import Sidebar from "./components/Sidebar";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import NewOrder from "./pages/NewOrder";
import Orders from "./pages/Orders";
import Customers from "./pages/Customers";
import Products from "./pages/Products";

import "./App.css";

function App() {
  const [employee, setEmployee] = useState<string | null>(null);

  const login = (username: string) => setEmployee(username);
  const logout = () => setEmployee(null);

  return (
    <BrowserRouter>
      {!employee ? (
        <Routes>
          <Route
            path="/login"
            element={<Login onLogin={login} />}
          />
          <Route
            path="*"
            element={<Navigate to="/login" replace />}
          />
        </Routes>
      ) : (
        <div className="app">
          <Sidebar onLogout={logout} />

          <div className="workspace">
            <header className="workspace-topbar">
              <div className="workspace-identity">
                <span className="workspace-product">Glyphora OMS</span>
                <span className="workspace-separator">/</span>
                <span>销售管理系统</span>
              </div>
              <div className="workspace-employee">
                <span className="online-dot" />
                <span>{employee}</span>
                <span className="employee-role">销售部</span>
              </div>
            </header>

            <main className="workspace-content">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/orders/new" element={<NewOrder />} />
                <Route path="/orders" element={<Orders />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/products" element={<Products />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>

            <footer className="workspace-statusbar">
              <span><span className="online-dot" /> 演示环境</span>
              <span>Glyphora OMS · Sales Workspace</span>
            </footer>
          </div>
        </div>
      )}
    </BrowserRouter>
  );
}

export default App;
