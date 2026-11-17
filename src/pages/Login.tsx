
import { useState, type FormEvent } from "react";
import "./Login.css";

interface LoginProps {
  onLogin: (username: string) => void;
}

function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!username.trim() || !password) {
      setError("请输入员工账号和密码");
      return;
    }

    setError("");

    // 前端演示：不验证密码
    // 正式版本在这里调用 ASP.NET Core 登录 API
    onLogin(username.trim());
  }

  return (
    <div className="login-page">
      <section className="login-brand">
        <div className="login-brand-name">
          <div className="brand-symbol">G</div>
          <span>Glyphora</span>
        </div>

        <div className="login-brand-content">
          <div className="brand-overline">
            ORDER MANAGEMENT SYSTEM
          </div>

          <h1>
            让销售工作
            <br />
            更简单、更高效。
          </h1>

          <p>
            从客户资料到订单处理，
            集中管理您的日常销售业务。
          </p>

          <div className="login-brand-features">
            <span>订单管理</span>
            <span>客户管理</span>
            <span>销售协作</span>
          </div>
        </div>

        <div className="brand-footer">
          © 2026 Glyphora
        </div>
      </section>

      <section className="login-form-section">
        <div className="login-form-container">
          <div className="login-app-icon">G</div>

          <div className="login-heading">
            <h2>欢迎回来</h2>
            <p>登录您的员工账号以继续工作</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="username">员工账号</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(event) =>
                  setUsername(event.target.value)
                }
                placeholder="请输入员工账号"
                autoComplete="username"
              />
            </div>

            <div className="login-field">
              <label htmlFor="password">密码</label>

              <div className="password-wrapper">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  placeholder="请输入密码"
                  autoComplete="current-password"
                />

                <button
                  type="button"
                  className="password-toggle"
                  onClick={() =>
                    setShowPassword(!showPassword)
                  }
                >
                  {showPassword ? "隐藏" : "显示"}
                </button>
              </div>
            </div>

            {error && (
              <div className="login-error" role="alert">
                {error}
              </div>
            )}

            <button type="submit" className="login-submit">
              登录工作台
              <span>→</span>
            </button>
          </form>

          <div className="login-notice">
            演示模式：输入任意非空账号和密码即可进入。
            当前不连接服务器，也不验证真实身份。
          </div>
        </div>

        <div className="login-bottom">
          Glyphora OMS · Sales Workspace
        </div>
      </section>
    </div>
  );
}

export default Login;
