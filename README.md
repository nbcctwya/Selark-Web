# Selark-Web

[Selark 的独立前端仓库](https://github.com/nbcctwya/Selark-Web)，使用 React + TypeScript + Vite。可以单独克隆、开发和测试，不需要 Python、Selark 安装、真实账户、密钥或本地数据库。

[Selark 主仓库](https://github.com/nbcctwya/Selark)通过 Git submodule 将本仓库引入 `frontend/`，固定到经过验收的提交。本仓库更新后，Selark 由集成维护者主动更新引用。

本仓库是 Selark Dashboard 的重新设计版本：五个页面（资源概览、连接与模型、用量分析、应用管理、运行监控）均已按新的视觉系统实现，支持桌面 / 手机、浅色 / 深色 / 跟随系统、键盘操作（`1`–`5` 切换页面、`R` 刷新、`⌘K` / `Ctrl+K` / `/` 打开命令面板）。当前日常 `selark dashboard` 仍使用原页面；正式接入由 Codex 负责。

## 启动

使用 Node.js 22.12+ 和 npm。独立开发先克隆本仓库：

```bash
git clone https://github.com/nbcctwya/Selark-Web.git
cd Selark-Web
```

在仓库根目录运行；已经在 Selark 中初始化子模块时，在 `frontend/` 中运行同样的命令：

```bash
npm ci
npm run dev
```

打开 `http://127.0.0.1:5173`。顶部开发工具栏可以切换场景、重置数据。模型启停只修改内存；刷新页面或重置即可恢复。开发服务只绑定本机。

```bash
npm run typecheck
npm test
npm run build
```

浏览器验收（仅本机模拟数据及拦截的 HTTP 响应）：

```bash
npx playwright install chromium
npm run test:browser
```

验收使用本机 5173、5174 两个端口，完成后自动关闭测试服务。`PLAYWRIGHT_CHROMIUM_EXECUTABLE` 可指定已有 Chromium 可执行文件。生产构建还会检查模拟 fixture 和开发工具栏代码没有被打包。

`npm run build` 输出 `dist/` 和 Vite manifest，使用真实 HTTP 适配器，自动排除模拟数据与开发工具栏。`npm run preview` 预览的是这个正式构建，需要同源 Dashboard API 和管理会话；独立设计验收请使用 `npm run dev`。

## 目录

```text
src/
  api/types.ts            # 前后端交接的数据类型和 DashboardApi 接口
  api/http.ts             # 真实 HTTP、独立管理会话、错误与取消
  mocks/fixture.json      # 从临时模拟账本导出的公开响应；没有真实凭据
  mocks/api.ts            # 内存模拟适配器：筛选、分页、修改、异常
  mocks/Workbench.tsx     # 仅开发模式加载的场景工具栏
  hooks/useDashboard.ts   # 加载、局部失败、旧快照、会话失效、记录分页、模型写入
  lib/format.ts           # 未知值、十进制金额、时间与状态文案
  lib/domain.ts           # 授权、可用性、配额等领域文案
  components/ui.tsx       # Pill、Switch、Segmented、Bar、Ring 等基础组件
  components/charts.tsx   # SVG 趋势图（键盘可读）、迷你走势、状态环形图
  components/Overlay.tsx  # 侧边详情、确认对话框、提示
  components/CommandPalette.tsx  # ⌘K 搜索页面、连接、模型、应用
  components/FiltersBar.tsx / Records.tsx / Metrics.tsx
  pages/                  # 概览与用量、连接与模型、应用、监控
  App.tsx                 # 外壳、导航、主题、快捷键、自动刷新
  main.tsx                # 开发/正式适配器选择
  styles.css              # 设计系统（CSS 变量，浅色 / 深色）
public/favicon.svg        # 本地图标
API.md                    # 当前真实接口、字段口径及交互约定
CLAUDE.md                 # 给 Claude 的任务与交付说明
BACKEND_REQUESTS.md       # 记录设计中需要的新后端能力
```

组件通过 `DashboardApi` 访问数据，避免直接导入 fixture 或在组件里写 `fetch`。真实和模拟适配器实现同一个接口；不要让某种数据源专属的字段进入产品组件。

## 已覆盖的模拟场景

| 场景 | 可检查的界面行为 |
| --- | --- |
| 正常数据 | 六个连接、多应用、65 条调用、费用、趋势、筛选与分页 |
| 空数据 | 无连接、无应用、无调用时的空状态 |
| 未知用量 | Token/费用为 null、配额暂停；不能显示成零 |
| 网关离线 | 历史可读，实时并发与队列未知 |
| 只读模式 | 不提供模型启停，模拟接口也拒绝写入 |
| 会话过期 | 401，清除页面资源数据并显示重新登录提示 |
| 读取失败 | 503、错误提示与刷新入口 |
| 部分数据不可读 | 资源可见，用量/记录不可读 |
| 修改冲突 | 第一次模型修改返回 409，刷新后需重新明确操作 |
| 慢速加载 | 延迟 1.8 秒，可检查加载提示、重复操作和导航 |

未知用量、真实零值、无记录必须分别呈现。时间筛选影响用量和调用记录；连接、应用权限和 UTC 今日配额保留全局范围。

## Git 交接

在本仓库的开发分支提交源码、依赖锁文件、新增本地素材和测试，通过分支或 PR 交接。提供分支名、完整提交 SHA、检查结果，以及 `BACKEND_REQUESTS.md` 中尚需后端实现的能力。`node_modules/`、`dist/`、真实配置和令牌不进入 Git。

Claude 参考的后端代码和固定基线见 [API.md](API.md)。前端目录之外的代码由 Selark 仓库维护；页面设计期间可以只读参考，无需复制到本仓库。

集成维护者先将前端提交推送到本仓库，再让 Selark 的 `frontend/` 指向该提交，完成联调后提交主仓库的版本引用。Git 子模块记录的是具体提交，不会自动采用本仓库的最新代码。

后续接入工作包括：将 Vite manifest 与哈希静态资源接到 Python 包、核对现有 CSP 与管理会话、验证模型写入权限/版本冲突、回归离线与未知用量场景，然后更新日常安装。此开发包不会自动替换已安装 Dashboard。

后端维护者可在 Selark 主仓库初始化子模块后运行 `python -m scripts.export_dashboard_fixtures`，从新的临时测试账本更新 fixture；变更需提交到本前端仓库。该命令不读取个人配置、不调用上游。独立前端开发无需执行它。

`.github/workflows/ci.yml` 在本仓库推送和 PR 时执行测试、正式构建与浏览器验收。Selark 另有集成检查，使用它记录的子模块提交。

当前交接基线及验证范围见 [VALIDATION.md](VALIDATION.md)。

工具链依据：[Vite 入门](https://vite.dev/guide/)、[React 的 Vite / TypeScript 接入说明](https://react.dev/learn/build-a-react-app-from-scratch)。依赖具体版本以锁文件为准。
