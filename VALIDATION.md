# 前端交接验收 · 2026-11-04

本地环境：Linux、Node 22.22.3、Chromium 149.0.7827.55。全部使用合成数据或浏览器拦截的 HTTP 响应，没有真实供应商、OAuth 或模型调用。

| 检查 | 结果 |
| --- | --- |
| TypeScript 与 Vite 正式构建 | 通过；输出静态文件及 manifest |
| 接口与模拟适配器测试 | 16 项通过 |
| Chromium 浏览器验收 | 5 项通过 |
| 后端公开数据契约及原 Dashboard 相关回归 | 62 项通过 |
| 独立目录验证 | 脱离 Selark 的临时目录中，离线 npm ci、测试、构建均通过 |
| 正式产物检查 | 未包含模拟 fixture 与开发工作台代码 |
| Python 格式、静态检查、差异空白检查 | 通过 |
| 仓库敏感信息检查 | 通过 |

浏览器覆盖：五页导航、用量筛选、分页、调用详情、模型启停、默认模型清除确认、409 后再次明确操作、只读模式、空/未知/部分失败/会话过期、390px 手机布局和深色主题。正式构建另在现有 CSP 下验证同源 HTTP、一次性登录只兑换一次、页面刷新保留会话、401 清除页面数据和会话。

`npm run test:browser` 会启动两个临时前端服务并在结束后关闭。Linux 需具有 Chromium 的系统运行库；本次通过临时解压的匹配库完成测试，没有系统级安装。

Selark-Web 具有独立 GitHub Actions 检查任务；以上表格记录本地验收，远端状态见 [Actions](https://github.com/nbcctwya/Selark-Web/actions/workflows/ci.yml)。Selark 的 CI 另外检出它固定的子模块提交，执行前端检查和后端数据契约回归。

当前源码用于前端独立设计，尚未替换 Python 包内的原 Dashboard 静态资源；真实后端接入和日常安装验收将在设计交回后进行。Git 交接方式见 [README.md](README.md)，后端源码基线见 [API.md](API.md)。
