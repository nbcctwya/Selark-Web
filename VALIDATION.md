# 前端交接与集成验收 · 2026-11-04

Claude 的设计交付为 `c656d1932af1753537e56876d8020ffac5883e89`，本次在此基础上完成真实后端适配。接口沿用 Selark `fbaa811` 的基线，OpenAPI 和依赖均未改动；最终发布版本以 Selark 的 submodule 引用及包内资源清单为准。

本次本地环境：Linux / WSL、Node 22.22.3、Python 3.12、Chromium。检查只使用合成账本、临时凭据和本机虚构供应商；真实供应商、OAuth 和模型生成请求为 0。

| 检查 | 结果 |
| --- | --- |
| TypeScript、Vite 正式构建、模拟代码隔离 | 通过 |
| `npm run check:api` | 生成类型与固定规范一致 |
| `npm test` | 23 项通过 |
| `npm run test:browser` | 11 项通过；含开发场景与正式构建 HTTP 拦截验收 |
| Selark 完整 Python 回归 | 824 项通过；保留一条既有 TestClient 弃用提示 |
| Python wheel / sdist | 包含 React 入口、哈希 JS/CSS、图标及校验清单；普通安装无需 Node |
| 已安装 wheel 的真实 Dashboard | 只读与管理两组 Chromium 验收通过；无脚本/CSP 错误 |
| 代码格式、差异空白、仓库敏感信息检查 | 通过 |

本轮修正与验证重点：

- 保留五页设计、筛选、分页、详情、深浅主题、键盘导航、空/未知/失败/离线状态及已有管理表单。
- 供应商、连接和应用详情读取统一遵守 20 秒期限；任何入口收到 401 都清空页面并关闭详情，中断待处理操作，避免迟到响应重新显示数据。
- 创建连接或应用时阻止误关弹层；真实创建 POST 暂停期间验证 Escape 与关闭按钮不会丢失一次性令牌。令牌响应只留在组件内存，关闭后清除，不写浏览器存储。
- 真实连接创建、Key 轮换、一次明确的模型发现、批量启用、默认模型、应用创建/配额/策略/撤销全部跑通；发现不自动启用，409 不自动重发。
- 修正真实长度应用 ID 导致的手机卡片溢出；模型开关保持原视觉并提供 44 × 44 像素点击区。1440px / 390px、五页和深浅主题检查通过。
- 验证只读服务端边界、默认模型禁用确认、跨端口会话隔离、刷新保留会话，以及同一端口连续重启三次。

浏览器测试使用的 fixture 与开发工作台没有进入正式产物。真实后端验收由 Selark 的 `scripts/verify_dashboard.py` 和 `scripts/verify_dashboard_controls.py` 执行；安装位置在临时虚拟环境，没有修改用户日常安装。

Selark 通过 `scripts/build_dashboard.py` 打包固定提交，CI 检查产物与源码一致。两个仓库分别触发 Actions；远端结果见 [Selark-Web Actions](https://github.com/nbcctwya/Selark-Web/actions/workflows/ci.yml) 与 [Selark Actions](https://github.com/nbcctwya/Selark/actions/workflows/ci.yml)。

后续修改请基于包含本轮修正的集成提交；交接方式见 [README.md](README.md)，后端契约见 [API.md](API.md)。OAuth、服务控制及备份恢复仍通过 CLI 操作。
