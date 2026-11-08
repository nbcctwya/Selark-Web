# Dashboard API 交接约定 v2

对应 Selark 0.10.0 的独立 Dashboard API，后端源码参考基线为 [`b8c26446385a138554aadc69aae51a046201f165`](https://github.com/nbcctwya/Selark/tree/b8c26446385a138554aadc69aae51a046201f165)。`v2` 是本交接文档的版本标识，不是 URL 前缀；它也不是模型调用用的 `/v1/chat/completions` API。

可只读参考以下代码；独立前端开发无需安装后端：

- [Dashboard 路由、管理会话与静态资源](https://github.com/nbcctwya/Selark/blob/b8c26446385a138554aadc69aae51a046201f165/src/selark/dashboard.py)
- [公开数据投影与筛选](https://github.com/nbcctwya/Selark/blob/b8c26446385a138554aadc69aae51a046201f165/src/selark/dashboard_data.py)
- [现有页面实现](https://github.com/nbcctwya/Selark/tree/b8c26446385a138554aadc69aae51a046201f165/src/selark/dashboard_assets)
- [Dashboard 功能说明](https://github.com/nbcctwya/Selark/blob/b8c26446385a138554aadc69aae51a046201f165/docs/guides/dashboard.md)

后端实现基线包含查询、连接、模型及应用管理 API；它与 OpenAPI 文档版本分别记录。
完整字段、请求和响应以本仓库固定的 [Dashboard OpenAPI](contracts/dashboard.openapi.json) 为准，其文档版本为 `2.0.0`。
规范由 Selark 导出，前端的 `src/api/generated.ts` 自动生成；`src/api/types.ts` 提供便于组件使用的别名和 `DashboardApi`。
主仓库维护入口为 [HTTP 接口文档](https://github.com/nbcctwya/Selark/tree/main/docs/api)，新增管理的业务说明固定到 [当前后端基线](https://github.com/nbcctwya/Selark/blob/b8c26446385a138554aadc69aae51a046201f165/docs/development/management-api.md)。
后端升级时同步规范、生成类型、fixture 和此基线；设计中的新需求记录到 `BACKEND_REQUESTS.md`。

## 数据访问边界

页面依赖 `src/api/types.ts` 的 `DashboardApi`，真实实现是 `src/api/http.ts`，模拟实现是 `src/mocks/api.ts`。fixture 来自真实后端对临时合成账本的公开投影。

模拟适配器只用于页面开发。它不模拟真实 OAuth、权限认证、扣费、预算准入或磁盘备份，也不代替后端测试。

| 方法 | HTTP 接口 | 响应类型 |
| --- | --- | --- |
| `initialize(bootstrap)` | `POST /api/session` | `authenticated`、`expires_in`、`session_token` |
| `snapshot(filters)` | `GET /api/snapshot` | `Snapshot` |
| `records(filters)` | `GET /api/records` | `RecordsPage` |
| `logs()` | `GET /api/logs` | `Logs` |
| `backups()` | `GET /api/backups` | `Backups` |
| `setModelApproval(change)` | `POST /api/model-approval` | `ModelApprovalResult` |

## 会话与请求

终端启动 Dashboard 后提供 `/#login=一次性凭证`。页面立即移除地址中的 fragment，再用 JSON `{"token":"YOUR_BOOTSTRAP_TOKEN"}` 兑换管理会话。链接有效 5 分钟、只能兑换一次；会话最长 8 小时。

除会话兑换外，API 请求均带 `X-Selark-Dashboard: 1` 和 `X-Selark-Session`。会话保存到当前 origin 的 sessionStorage，浏览器禁用存储时使用内存。刷新可继续使用已有会话；这不是供应商 Key 或应用调用令牌。

请求使用相对 `/api/` 地址、`credentials: omit`、`mode: same-origin`、`redirect: error`、`cache: no-store`。POST 的 Content-Type 必须为 `application/json`，由浏览器发送精确 Origin。生产后端没有跨源 CORS 放行；后续集成由 Python 在同一个 origin 提供前端和 API。

## 查询

- `period`：`24h` / `7d`（默认）/ `30d` / `90d` / `custom`。
- 自定义时间必须提供带时区的 `since`、`until`；开始包含、结束不包含，范围大于零且不超过 366 天。
- 可选 `caller_id`、`connection_id`、`model`：精确标识筛选。
- 记录接口另有 `offset`（默认 0）、`errors`（`true`/`false`）；每页固定 25 条，响应包含 `items/total/offset/limit`。
- 先取得 snapshot，再使用 `usage.filters.since/until` 查询同一窗口的记录，避免滚动窗口偏移。
- 时间/应用/连接/模型筛选只影响用量与记录。所有连接和应用仍完整展示；日志、备份是自己的最近窗口。

## Snapshot 主要字段

| 字段 | 意义 |
| --- | --- |
| `checked_at/version/scope/ok/issues` | 快照时间、版本、范围及读取问题；`ok=false` 不必丢弃仍可读部分 |
| `connections` | 连接与凭据本地状态、模型目录、启用、应用获权和历史能力 |
| `applications` | 调用方身份、策略、UTC 今日配额及实际获权资源 |
| `service` | 本机健康检查；不可达时并发等字段可能缺失 |
| `usage` | 筛选窗口内的汇总、逐日趋势、前 10 个模型；账本不可读时为 null |
| `options` | 历史模型/连接筛选项，可能包含已删除的资源 |
| `limits` | 本地运行限制；部分读取失败时可能缺失 |
| `capabilities.model_approval` | 是否提供模型写入入口 |

完整字段以 TypeScript 类型为准；实例如 `src/mocks/fixture.json`。不要把 fixture 的具体模型名、应用 ID 或六个连接数量写死在组件里。

## 模型写入

```json
{
  "connection_id": "openai-demo",
  "model": "demo-text",
  "enabled": false,
  "revision": 3,
  "clear_default": true
}
```

`revision` 必须取最近快照中该连接的 `model_catalog.approval_revision`。禁用默认模型时先确认，再传 `clear_default=true`。成功响应包含 connection_id、model、enabled、default_model；不含新 revision，因此成功后重新读取 snapshot。

启用与应用授权独立；历史成功不代表当前可用。`authorized_applications` 是策略匹配，`effective_applications` 还考虑连接和模型启用等本地条件。

## 错误与显示

错误体为 `{"error":"说明文字","code":"machine_code"}`；旧查询与共用会话边界可能没有 `code`。通过 `ApiError.status` 和可选的 `ApiError.code` 判断，不解析中文错误字符串。

| 状态 | 页面行为 |
| --- | --- |
| 400 | 筛选/字段无效，展示说明 |
| 401 | 清除所有资源数据和详情，要求重新打开管理链接 |
| 403 | 同源/请求边界不满足，展示失败 |
| 405 | 只读模式或不存在的写入能力 |
| 409 | 默认模型需确认或版本冲突；刷新后由用户再次明确操作 |
| 408 / 413 / 429 | 超时、请求过大、登录过频，展示错误 |
| 503 / 网络失败 | 显示读取失败；保留旧快照时必须标明它是旧数据 |

前端普通读取/写入默认等待 20 秒，`discoverModels` 默认等待 45 秒。传入 AbortSignal 时由调用方控制取消及截止时间；写入取消或超时不证明服务端未完成。写入超时不证明操作未发生，不能自动重试，应该提示刷新核对。

`null`、缺失字段、真实零分别处理。费用用十进制字符串按币种展示，不把订阅费用、未知余额填成零。配额包含保守预留，日配额固定 UTC；历史趋势按 UTC 日分组。调用最终状态、上游结果、下游交付、用量完整性分别展示。

## 新增管理方法

HTTP 与内存模拟适配器都实现以下方法，组件继续只依赖 `DashboardApi`。方法与 OpenAPI 的 `operationId` 一致。

| 方法 | HTTP 接口 | 返回类型 |
| --- | --- | --- |
| `getCapabilities()` | GET `/api/capabilities` | `Capabilities` |
| `getProviders()` | GET `/api/providers` | `{ items: Provider[] }` |
| `getConnections()` / `createConnection(input)` | GET / POST `/api/connections` | 列表 / `ManagedConnection` |
| `getConnection(id)` / `updateConnection(id, input)` | GET / PATCH `/api/connections/{identity}` | `ManagedConnection` |
| `getConnectionModels(id)` | GET `/api/connections/{identity}/models` | `ManagedModels` |
| `discoverModels(id)` | POST `/api/connections/{identity}/discover`，请求体 `{}` | `ManagedModels` |
| `approveModels(id, input)` | POST `/api/connections/{identity}/models/approval` | `ManagedModels` |
| `setDefaultModel(id, input)` | PUT `/api/connections/{identity}/models/default` | `ManagedModels` |
| `getApplications()` / `createApplication(input)` | GET / POST `/api/applications` | 列表 / `CreatedApplication` |
| `getApplication(id)` | GET `/api/applications/{identity}` | `ManagedApplication` |
| `updateApplicationPolicy(id, input)` | PATCH `/api/applications/{identity}/policy` | `ManagedApplication` |
| `revokeApplication(id, input)` | POST `/api/applications/{identity}/revoke` | `RevokedApplication` |
| `getApplicationQuota(id)` | GET `/api/applications/{identity}/quota` | `ApplicationQuota` |

每个方法的最后一个可选参数为 `AbortSignal`。`ManagedConnection` / `ManagedApplication` 是编辑详情，区别于 snapshot 的 `Connection` / `Application` 投影，不能互相替代。

### 连接和模型流程

以下示例中的 `api` 是组件收到的、已初始化的 `DashboardApi`；示例 Key 只是占位值。

```ts
const connection = await api.createConnection({
  id: 'my-relay', provider: 'openai-compatible',
  name: '我的中转', base_url: 'https://relay.example/v1', api_key: 'YOUR_PROVIDER_API_KEY',
});
// 创建后没有启用模型，也不会自动发现。发现应由用户明确触发。
const catalog = await api.discoverModels(connection.id);
if (catalog.discovery.state === 'success' && catalog.discovery.current) {
  const approved = await api.approveModels(connection.id, {
    revision: catalog.approval_revision, enabled: true, all_models: true,
  });
  const model = approved.models.find(item => item.approved);
  if (model) await api.setDefaultModel(connection.id, { revision: approved.approval_revision, model: model.id });
}
```

实际页面为发现、启用和默认模型设置提供各自的明确操作。HTTP 200 的发现结果也可能是 failure；显示错误并保留旧目录，不把它当作成功。
编辑连接先调用 `getConnection`，使用返回的字符串 `revision`；字段是否可编辑由 `editable_fields` 决定。保持 Key 时省略 `api_key`，不能提交掩码。
模型操作使用整数 `approval_revision`。禁用默认模型会返回 `default_model_confirmation`，用户确认后才传 `clear_default=true`。
`connection_changed`、`model_approval_changed` 和 `state_changed` 均要求刷新核对；`discovery_busy` 表示另一发现任务正在运行。

### 应用和一次性令牌

```ts
const created = await api.createApplication({
  name: '我的编辑器', policy: { allowed_connections: ['my-relay'], daily_token_limit: 100000 },
});
// created.token 仅交给临时展示/复制区域，关闭后清除，不能写入日志或本地存储。
const current = await api.getApplication(created.id);
await api.updateApplicationPolicy(current.id, {
  revision: current.revision, policy: { daily_budget: '1.00', budget_currency: 'USD' },
});
```

`policy` 是非空补丁，未传字段保持不变。允许列表 `null` 表示通配，`[]` 表示不允许任何资源；订阅还需要专门权限和明确连接。
修改或撤销都需最新字符串 `revision`。撤销响应的 `in_flight_policy=already_admitted_requests_continue` 表示已接纳请求继续完成。
创建响应丢失时先刷新应用列表确认结果，令牌无法再次查询；必要时由用户撤销并重新创建。禁止自动重试创建或其他写入。

### 能力与模拟边界

新页面先读取 `getCapabilities()`，按四项能力控制操作入口；后端和模拟接口都拒绝被关闭的操作。
`readonly` 关闭所有管理写入；`offline-mode` 关闭模型发现但允许本地管理；`offline` 仅模拟网关不可达。
`discovery-error` 模拟发现返回失败状态并保留目录，`conflict` 模拟首次编辑时版本已变化。

模拟实现依据规范校验请求结构，维护连接、模型、应用、配额投影及版本；提交的 Key 不保存，创建的演示令牌只出现在创建返回值中。
它不执行真实授权、供应商校验、推理、计费、预算派发、文件备份或数据库事务；这些仍通过后端联调验收。
当前页面骨架尚未添加所有新管理表单，Claude 可使用以上已就绪的方法实现它们。

## 契约维护

日常页面设计使用已提交的类型，无需额外工具。修改接口契约时，先由后端维护者导出规范和 fixture，再执行：

```bash
npm run setup:api
npm run generate:api
npm run check:api
npm test
npm run test:browser
```

`tools/api-types/` 是独立、锁定版本的生成工具，保持页面工程的 TypeScript 7；其 Undici 依赖固定到修复版本。生成器只接受本地引用，并禁止联网。
`npm run check:api` 只比较生成结果，不重写文件。CI 检查类型与固定规范一致，Selark 的契约测试还核对规范副本、真实路由和响应。
不要手工编辑 `src/api/generated.ts` 或在组件中另外复制接口字段。交付时提供前端提交及这里记录的后端基线。

前端请求边界只序列化当前契约的策略字段，兼容旧页面草稿；不向后端转发未知属性。保留 `false`、`null`、空列表和所有限额，既不补默认值也不扩大权限。过滤后没有有效字段的旧草稿在本地拒绝，提示重新打开表单；新建应用不传策略时仍使用后端默认值。
