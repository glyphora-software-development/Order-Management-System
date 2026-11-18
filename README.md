# Glyphora OMS

销售订单管理系统（Order Management System）的 **演示项目（Demo）**。
面向销售人员的日常工作台：管理客户和商品，并快速开立销售订单。

> ⚠️ 这是演示版本：没有后端，登录不会验证身份，所有数据只保存在浏览器本地。
> 请勿用于存放真实业务数据。

## 功能

| 模块 | 说明 |
| --- | --- |
| 登录 | 演示登录，输入任意非空账号和密码即可进入 |
| 仪表盘 | 销售概览：今日订单、待确认、处理中、今日销售额（不含草稿和已取消）、最近订单和工作提醒，均由本地订单实时计算 |
| 销售开单 | 选择客户和商品，填写数量与单价，保存为草稿或待确认订单 |
| 订单列表 | 搜索订单、查看详情、更新订单状态 |
| 客户管理 | 客户资料的新增、编辑、删除、搜索；已有订单的客户不能删除 |
| 商品管理 | 商品 SKU、名称、单价的维护，支持上下架；仅「销售中」的商品可用于开单 |

订单状态：草稿 → 待确认 → 已确认 → 处理中 → 已完成（也可取消）。

## 技术栈

- React 19 + TypeScript
- Vite
- React Router
- ESLint
- [Tauri 2](https://tauri.app)（桌面应用外壳）

## 快速开始

需要 Node.js 和 npm。

```bash
npm install
npm run dev       # 开发服务器
npm run build     # 类型检查 + 生产构建
npm run lint      # 代码检查
npm run preview   # 预览生产构建
```

## 桌面应用（Tauri）

项目已配置 Tauri 2，可以打包为桌面应用（Windows / macOS / Linux）。

### 环境要求

1. Node.js 和 npm
2. Rust（通过 [rustup](https://rustup.rs) 安装，需要 1.90 或更高版本）
3. 各系统的编译依赖，参见 [Tauri 官方文档](https://v2.tauri.app/start/prerequisites/)
   - Windows：Microsoft C++ Build Tools 和 WebView2
   - macOS：Xcode Command Line Tools
   - Linux：WebKitGTK 等系统库

### 命令

```bash
npm install
npm run tauri dev      # 以桌面窗口运行（自动启动 Vite 开发服务器）
npm run tauri build    # 打包安装程序，产物在 src-tauri/target/release/bundle/
```

第一次运行需要下载并编译 Rust 依赖，会比较慢；之后会快很多。

> 开发服务器端口固定为 5173。如果端口被占用，`tauri dev` 会直接报错，需要先关闭占用的程序。

## 项目结构

```
src/
├── components/     通用组件（侧边栏）
├── pages/          页面（登录、仪表盘、开单、订单、客户、商品）
├── services/
│   ├── masterDataStorage.ts   客户、商品的数据读写
│   └── orderStorage.ts        订单的数据读写与金额计算
├── App.tsx         路由与整体布局
└── main.tsx
src-tauri/          Tauri 桌面应用（Rust 部分、窗口与打包配置）
```

## 数据存储

数据通过 `src/services` 下的函数读写，目前使用浏览器 `localStorage`：

| Key | 内容 |
| --- | --- |
| `glyphora-oms-customers` | 客户 |
| `glyphora-oms-products` | 商品 |
| `glyphora-oms-demo-orders` | 订单 |

订单同时保存 `customerId` 和下单时的客户名称快照，
客户改名后历史订单显示不受影响。
早期没有 `customerId` 的旧订单仍按客户名称匹配。

页面不直接访问 `localStorage`，而是调用 `services` 里的函数，
以后更换存储方式时只需要改这一层。

## 计划

- 替换默认的 Tauri 应用图标（使用 `npm run tauri icon` 生成）
- 在各平台实际打包并验证（目前配置已就绪，尚未做完整的跨平台测试）
- 将 `localStorage` 换成更可靠的本地存储（例如 SQLite），避免清理浏览器数据时丢失订单
- 补充自动化测试
