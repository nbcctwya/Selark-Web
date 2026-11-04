# 后端接入需求

重新设计的五个页面只使用 `API.md` 中已实现的 v1 接口，**不依赖任何新增 API**。页面中没有任何「待接入」的伪操作：除模型启用 / 禁用外，连接、密钥、OAuth、应用策略、额度与服务控制都只读展示，并提示通过 CLI 管理。

以下是后续可接入的能力。前四项在 Selark `b8c2644` 中已有后端实现（见 `API.md` 末节），需要先扩展 `DashboardApi`、HTTP 适配器与模拟适配器，再加入界面；最后一项为桌面版预留。

| 页面 / 用户操作 | 所需能力 | 请求示例 | 响应示例 | 错误 / 权限 / 确认规则 | 原型状态 |
| --- | --- | --- | --- | --- | --- |
| 全局：按启动模式显示可用操作 | `GET /api/capabilities` | 无请求体 | `{"connection_management":true,"model_approval":true,"model_discovery":true,"application_management":true}` | `--read-only` 全部为 false；`--offline` 关闭发现。替代 `snapshot.capabilities.model_approval` 作为操作开关 | 未接入；当前只读取 `snapshot.capabilities.model_approval` |
| 连接详情 · 模型目录：「设为默认」 | `PUT /api/connections/{id}/models/default` | `{"revision":2,"model":"demo-text"}`；`model:null` 清除 | 模型目录对象 | 默认模型必须已启用；409 `model_approval_changed` 后刷新、由用户再次确认；不自动把刚启用的模型设为默认 | 未接入；页面写明「在 CLI 中选择新的默认模型」 |
| 连接详情 · 模型目录：「刷新目录」 | `POST /api/connections/{id}/discover` | `{}` | 模型目录对象，含 `discovery.state`、`error_code` | HTTP 200 不代表发现成功；等待 ≥45 秒；409 `discovery_busy` / `state_changed` 只提示，不重试；只读或离线模式隐藏 | 未接入；页面写明「模型发现通过 CLI 显式触发」 |
| 连接详情 · 模型目录：批量启用 / 禁用 | `POST /api/connections/{id}/models/approval` | `{"revision":1,"enabled":false,"models":["model-a","model-b"],"clear_default":false}` | 模型目录对象 | 涉及默认模型时 409 `default_model_confirmation`，用户确认后带 `clear_default:true` 重发；其他 409 刷新后重新选择 | 未接入；当前逐个开关调用 v1 `model-approval` |
| 应用详情：撤销令牌 / 修改策略 | `POST /api/applications/{id}/revoke`、`PATCH /api/applications/{id}/policy` | `{"revision":"当前应用版本"}` / `{"revision":"…","policy":{"daily_token_limit":100000}}` | 应用对象 | 撤销需二次确认且无法恢复，已派发请求继续完成；409 `application_changed` 刷新后重新确认；写入不自动重试；不显示令牌明文 | 未接入；页面只读展示策略 |
| 桌面版（Windows / macOS）：托盘状态、系统通知、打开配置目录 | 平台适配层能力，不经 `DashboardApi` 业务接口 | 由桌面壳提供，如 `platform.openConfigDirectory()` | — | 仅桌面壳可用；网页版隐藏入口 | 未设计入口；页面已保持与平台无关 |

正式接入时由 Codex 核对并实现。
