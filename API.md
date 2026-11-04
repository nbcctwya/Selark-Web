# Dashboard API 交接约定 v1

对应 Selark 0.10.0 的独立 Dashboard API，后端源码参考基线为 [`5e3fa039dba72dc4a1de813289c0bcce753a02c2`](https://github.com/nbcctwya/Selark/tree/5e3fa039dba72dc4a1de813289c0bcce753a02c2)。`v1` 是本交接文档的版本标识，不是 URL 前缀；它也不是模型调用用的 `/v1/chat/completions` API。

可只读参考以下代码；独立前端开发无需安装后端：

- [Dashboard 路由、管理会话与静态资源](https://github.com/nbcctwya/Selark/blob/5e3fa039dba72dc4a1de813289c0bcce753a02c2/src/selark/dashboard.py)
- [公开数据投影与筛选](https://github.com/nbcctwya/Selark/blob/5e3fa039dba72dc4a1de813289c0bcce753a02c2/src/selark/dashboard_data.py)
- [现有页面实现](https://github.com/nbcctwya/Selark/tree/5e3fa039dba72dc4a1de813289c0bcce753a02c2/src/selark/dashboard_assets)
- [Dashboard 功能说明](https://github.com/nbcctwya/Selark/blob/5e3fa039dba72dc4a1de813289c0bcce753a02c2/docs/dashboard.md)

后端升级时由集成维护者重新核对本契约及 fixture，并更新参考基线。新能力先记录到 `BACKEND_REQUESTS.md`。

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

错误体为 `{"error":"说明文字"}`，通过 `ApiError.status` 判断状态，不解析中文错误字符串。

| 状态 | 页面行为 |
| --- | --- |
| 400 | 筛选/字段无效，展示说明 |
| 401 | 清除所有资源数据和详情，要求重新打开管理链接 |
| 403 | 同源/请求边界不满足，展示失败 |
| 405 | 只读模式或不存在的写入能力 |
| 409 | 默认模型需确认或版本冲突；刷新后由用户再次明确操作 |
| 408 / 413 / 429 | 超时、请求过大、登录过频，展示错误 |
| 503 / 网络失败 | 显示读取失败；保留旧快照时必须标明它是旧数据 |

前端读取/写入最长等待 20 秒；AbortSignal 用于取消被替代的读取。写入超时不证明操作未发生，不能自动重试，应该提示刷新核对。

`null`、缺失字段、真实零分别处理。费用用十进制字符串按币种展示，不把订阅费用、未知余额填成零。配额包含保守预留，日配额固定 UTC；历史趋势按 UTC 日分组。调用最终状态、上游结果、下游交付、用量完整性分别展示。

## 新后端提交核对（2026-11-04）

页面实现仍以上方基线 `5e3fa03` 的 v1 接口为准。设计时核对了 Selark 最新提交 [`b8c26446385a138554aadc69aae51a046201f165`](https://github.com/nbcctwya/Selark/tree/b8c26446385a138554aadc69aae51a046201f165)，与本前端相关的差异如下：

- v1 的 `snapshot`、`records`、`logs`、`backups`、`model-approval` 保持兼容；前端无需修改即可使用。
- `snapshot.service` 的健康检查改为使用 `server_url(config)`，不再限定 127.0.0.1 / localhost / 0.0.0.0 主机；返回字段与投影不变。
- 新增日常管理接口（[说明](https://github.com/nbcctwya/Selark/blob/b8c26446385a138554aadc69aae51a046201f165/docs/development/management-api.md)）：`/api/capabilities`、`/api/providers`、连接列表 / 创建 / 修改、显式模型发现、批量审批、默认模型设置、应用创建 / 策略修改 / 撤销、应用配额。错误体增加可选 `code`。
- 本次前端**没有接入**这些新接口：`DashboardApi` 与模拟适配器未扩展，页面仍只提供单模型启用 / 禁用，其余操作明确提示通过 CLI 管理。接入意图见 `BACKEND_REQUESTS.md`。
