# 给 Claude 的前端任务

请为 Selark 设计并初步实现 React 前端。Selark 是本机个人 AI 资源管理工具，管理 API 连接、订阅、模型授权、应用用量及运行状态。

先阅读 `README.md`、`API.md` 和 `src/api/types.ts`，运行 `npm ci && npm run dev`。开发时不需要 Selark 后端。

你维护的是独立仓库 [Selark-Web](https://github.com/nbcctwya/Selark-Web)。[Selark](https://github.com/nbcctwya/Selark) 是后端与集成仓库，通过 submodule 引用本仓库。根据 `API.md` 中固定提交的源码链接了解现有功能、接口和原页面；如果需要最新后端变化，先记录新的参考提交与接口差异。

## 设计范围

- 可以重新设计布局、配色、导航、排版、图表和交互；现有样式只是工作骨架。
- 覆盖资源概览、连接与模型、用量分析、应用管理、运行监控五个页面。
- 支持桌面、手机、浅色/深色、键盘访问，以及加载、空数据、部分失败、离线和会话过期状态。
- 可按需要拆分组件和页面、增加本地素材与前端依赖，并更新 npm 锁文件。
- 数据访问通过 `DashboardApi`。页面不要直接读 fixture、Python 文件、数据库或凭据，也不要自行请求模型供应商。

## 与现有后端对齐

- 连接创建/修改/Key 轮换、模型发现/批量审批/默认值，以及应用创建/策略/配额/撤销均已有 HTTP 和模拟适配器。使用 `API.md` 的方法实现表单和交互。
- 服务控制、备份恢复、迁移、价格和别名编辑仍通过 CLI 完成；如需页面支持，记录后端需求。
- `contracts/dashboard.openapi.json` 是固定规范，`src/api/generated.ts` 自动生成。通过 `src/api/types.ts` 使用类型；不手工修改生成文件或另写一套字段定义。
- 模型发现、启用、应用授权、历史验证是四个独立状态。
- 禁用默认模型必须明确确认清除默认值；启用模型不会自动设为默认。409 后刷新，不能自动重发修改。
- 新管理页面读取 `getCapabilities()` 的四项开关；`capabilities.model_approval=false` 时禁用模型操作。离线模式关闭发现，但仍允许本地管理。
- 连接和应用编辑携带详情的字符串 `revision`，模型使用整数 `approval_revision`。API Key 不能回显；应用令牌只在创建时提供一次复制机会，关闭后清除。
- 发现请求允许等待 45 秒，HTTP 200 后仍检查 `discovery.state`；保留失败时的旧目录。创建连接不自动发现或启用模型。
- `null` 是未知；金额是字符串，币种分别展示。Token 与费用预留、历史使用、官方套餐余额不能混称。
- 401 清除已展示的资源数据和打开的详情。登录信息由 HTTP 适配器处理，管理会话不使用 Cookie。
- 正式构建采用同源 API 和本地静态资源。现有 CSP 不允许内联脚本、内联 style、外部 CDN、远程字体或 eval；SVG 属性可以用于图表。
- 如果新设计需要尚不存在的接口，把请求/响应草案和交互意图写进 `BACKEND_REQUESTS.md`。原型可标记为待接入，不能把现有只读能力伪装成已支持的操作。
- 保留 `import.meta.env.DEV` 对模拟代码的隔离，正式构建不能内置 fixture 或模拟管理能力。

## 交付

1. 在 Selark-Web 的开发分支提交前端源码及依赖锁文件，不包含 node_modules、构建产物和私人文件。交付分支或 PR 链接以及完整提交 SHA，保留已有 Git 历史。
2. 完成 `npm run typecheck`、`npm test`、`npm run test:browser`（包含正式构建）；修改规范时另运行 `npm run setup:api`、`npm run generate:api` 和 `npm run check:api`。新增功能优先扩展现有流程验证，浏览器测试可随设计更新定位方式，但应保留覆盖的行为。
3. 在浏览器检查所有开发场景、筛选、分页、详情、模型启停、默认模型确认，以及手机和深浅主题。
4. 写清完成内容、检查结果、参考的后端提交和剩余问题。后端适配、子模块引用更新与正式集成由 Codex 完成。

未来 Windows/macOS 桌面版计划复用通用页面；系统文件、窗口、托盘等能力需要单独适配。当前页面继续通过 `DashboardApi` 访问业务数据，把新增平台能力需求记入 `BACKEND_REQUESTS.md`。
