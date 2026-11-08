# Selark Desktop · Windows

基于 [Selark-Web](https://github.com/nbcctwya/Selark-Web) 的 React / TypeScript 前端，接入 [Selark](https://github.com/nbcctwya/Selark) Dashboard API 的 Windows x64 桌面应用。0.5.0 内置 Windows 原生后端、Python 与依赖，也可连接 WSL 的 Selark。Electron 直接加载本地构建资源，最终用户无需另装 Node、Vite 或 Python。WSL 自动连接使用该环境中已有的 Python 3.8+ 和 Selark，按需启动 Dashboard。

## 直接使用

安装 `release/Selark-Setup-0.5.6-x64.exe`，或直接运行 `release/win-unpacked/Selark.exe`。免安装目录必须完整保留，不能单独复制其中的 exe。上级目录的 `启动 Selark.cmd` 使用上次选择；另有 Windows、WSL 和选择后端三个专用 CMD。已安装旧版的程序不会随源码更新；关闭旧版后运行新安装包升级，连接偏好独立保存在用户目录中。

0.5.6 由前端按当前契约序列化应用策略，修复旧草稿保存失败，同时保留权限和限额。内置 Windows 核心与 WSL 共用严格的 API / Token Plan 接口；已有退役数据由独立的一次性维护清理，后端不保留相关识别或迁移代码。

0.5.3 在「模型目录」展示按具体模型匹配的推理档位，并在「客户端接入」默认自动选用：Kimi Coding 的可调档模型只展示 `low/high/max` 三档，GPT-6 文本模型五档，GPT-5.1 三档、GPT-5.2 四档，固定思考与图片模型单独标明。兼容别名不再当作额外档位；旧版已保存的 Kimi 自动配置会保留等效默认值。未知模型明确标记待确认，可在高级选项中手动覆盖。匹配使用已核对的模型规格，无额外模型请求。

0.5.4 补齐普通 Kimi API 的 K3 / K3.1 三档、智谱 GLM 5.3 三档和 GLM 5.2 两档，并识别 MiMo 2.6、Kimi 2.6、较早 GLM 的思考开关，以及 Claude Sonnet / Haiku 4.5 的 Token 预算。只有实际支持强度的模型才生成 Effort 菜单；开关 / 预算模型导出服务默认配置，同时提供原生请求示例。固定思考与未知能力也不由客户端猜测菜单。GLM Coding 仍显示后端尚未开放生成。GLM 5.3 的缺省请求不再自动附加旧版关闭思考参数。

「客户端接入」可导出 DSH 配置与通用请求示例。OpenAI API 默认 Responses，Anthropic 使用 Messages，Kimi Coding 默认 Chat Completions。设置按工作空间、连接和模型隔离保存在桌面本地，复制到客户端后生效，不包含上游 Key。每次请求选择优先于默认值，不自动修改 DSH 或创建应用。已导入 0.5.2 Kimi 配置的 DSH 需要重新合并导出配置，才能移除旧菜单别名。详细用法及套餐权限见同级后端的[推理档位指南](../backend/docs/guides/reasoning-effort.md)。

首次打开可选「Windows 本地」「WSL 自动连接」「手动连接」。Windows 模式点击「打开 Windows 工作空间」会创建空配置并启动原生网关，在「连接与模型」添加自己的服务后使用；不会自动导入 WSL 账户或调用模型。默认配置为 `%LOCALAPPDATA%\Selark\config`，账本等数据为 `%LOCALAPPDATA%\Selark\data`。高级设置支持独立配置目录、只读模式和退出后保留网关；自定义目录的数据默认在其下 `data/`。

Windows 新工作空间默认网关端口 8788，已有配置沿用原端口；WSL 常用 8787。管理服务自动选择临时回环端口。两种后端各自保存数据，不同时打开同一 SQLite 账本。标题栏「切换后端」随时打开选择页，仅查看或返回不会停止当前网关；点击连接才执行切换。应用已打开时，专用 CMD 会唤起窗口并预选入口，点击连接后生效。

0.4.2 重排 macOS 风格的统一工具栏、柔雾侧栏和居中详情面板，并为 Win11 Fluent、macOS、融合三套外观统一细圆角滚动条：透明轨道、无箭头、悬停加深，保留直接拖动、滚轮与键盘滚动。点击标题栏右侧「外观」或按 `Ctrl+,` 即时切换，选择会自动保存。三套均支持浅色/深色/跟随系统，并保留 Windows 原生窗口按钮。`Ctrl+B` 可收起侧栏。预览和区别见 [外观说明](APPEARANCE.md)。

使用 WSL 时：

1. 在「WSL 自动连接」中选择已经安装 Selark 的 WSL 环境，例如 `Ubuntu-20.04`。
2. 点击「连接 WSL 工作空间」，应用自动启动 Dashboard 并完成登录，无需打开终端或复制凭据。
3. 保留默认勾选的「下次打开应用时自动连接」，以后双击应用即可。会话过期时自动恢复连接；保存操作不会自动重放，页面会提示核对操作结果。

默认在所选 WSL 用户的 PATH 和 `~/.local/bin/selark` 查找程序，使用 Selark 默认配置目录。「高级设置」可指定程序绝对路径和配置目录，或开启只读模式。连接失败可重试、切换环境或修改路径。「连接设置」可以返回这个入口。

WSL 自动连接仅管理自己启动的临时 Dashboard 和助手，关闭后已有 WSL 网关及其他 Dashboard 保持运行。Windows 模式默认在退出或切换时正常停止本次由桌面启动的网关；此前已运行的网关始终保留。可勾选「退出或切换后保留 Windows 网关」供其他应用继续调用，再次连接会复用它。管理会话续接不重启 Windows 网关；父进程退出会通过管道关闭触发清理，没有定时进程扫描。

也可选择「手动连接」：在 WSL 运行 `selark dashboard --no-open`，将完整 `http://127.0.0.1:8790/#login=…` 链接粘贴到应用。手动链接只能使用一次且 5 分钟内有效，会话最长 8 小时；此模式不自动获取新链接。

后端未启动时，窗口可独立打开。手动连接下的「连接诊断」可检查端口，不会调用模型。允许本机 `127.0.0.1` 和 `localhost`（自动规范为 `127.0.0.1`），支持自定义端口。连接依赖 Windows 能访问 WSL 的 localhost 端口；应用不改变 WSL 网络设置。

当前安装包未配置代码签名证书。已在本机 Ubuntu-20.04 / Selark 0.10.0 完成真实只读联调，包括打包后的应用。管理写入用例使用合成数据，未修改真实供应商配置。

## 已实现

- 对齐 Selark 后端实际发布的完整 Web 前端 `b0e22be3836ea52bff5918ce4c34e2c82e22b284`。五个页面、详情、管理表单和交互采用同一套实现，详见 [功能对齐说明](FEATURE_PARITY.md)。
- 搜索页面、连接、模型和应用的命令面板；浅色、深色、跟随系统；页面导航和键盘图表读数。
- Token、调用次数、费用、成功率、平均耗时五项趋势切换，图表/数据表切换，模型分布与用量口径详情。
- 连接授权与历史验证、官方套餐窗口、任意所选模型批量启停；应用资源选择、策略预览与配额详情。
- 资源概览、时间/应用/连接/模型筛选、用量趋势、费用估算、分页记录与调用详情。
- 连接创建、编辑、Key 轮换、启停、超时/协议/套餐设置，按 `editable_fields` 限制编辑。
- 显式模型发现、单个/全部启停、设置/清除默认模型；禁用默认模型先确认。
- 应用创建、一次性令牌展示/复制、权限与每日配额编辑、撤销应用。
- 网关健康状态、结构化日志、备份清单；未知值与零值分别呈现。
- 单实例、窗口尺寸记忆、原生窗口控制。`Ctrl+K` 或 `/` 搜索，`1…5` 或 `Ctrl+1…5` 切页，`R` 或 `Ctrl+R` 刷新数据。
- 三套完整桌面外观、原生标题栏按钮、固定侧栏与工具栏、独立内容滚动；即时切换不重连、不丢草稿，记住风格和侧栏展开状态。
- WSL 环境选择、一键连接、记住环境并自动连接、过期会话恢复、自定义程序/配置路径与只读模式。
- 只读/离线能力开关、401 清空数据、409 刷新版本并要求重新操作、超时与取消。写入不自动重试。

Windows 核心启停已接入桌面生命周期；备份恢复和 WSL 核心启停仍使用 Selark CLI。内置 CLI 位于应用目录的 `resources\backend\selark-core.exe`，保留 `service status/stop` 等命令。

## 性能与会话

页面代码分块加载；快照与操作能力最多复用 10 秒，手动刷新和写入后强制更新。翻页只查询记录，日志和备份仅在运行监控页加载。概览显示最近 6 条记录，分析/监控每页 25 条；模型目录先渲染 80 条，可继续加载，搜索仍覆盖完整目录；应用名称查询使用索引。命令面板打开时才建立模型搜索列表。

自动刷新默认关闭，可开启每 30 秒刷新；原生窗口最小化/隐藏、页面不可见、表单聚焦、对话框打开或请求进行中时暂停。关闭窗口后退出桌面并清理自己的临时 Dashboard，不驻留托盘；Windows 网关按上文所有权与保留设置处理。启动助手使用阻塞管道等待退出事件，没有模型心跳或定时进程扫描。性能对比见 [PERFORMANCE.md](PERFORMANCE.md)。

管理链接由主进程兑换，会话只在主进程内存中保存，页面重载可复用，应用退出即丢弃。自动连接不把管理凭据交给页面或写入偏好文件。桌面界面与偏好文件不持久化供应商 Key、应用令牌或资源快照；Windows 后端将业务凭据保存在其受私有 ACL 保护的配置中，WSL 仍保存在自身环境。显式复制令牌会写入 Windows 剪贴板。偏好文件保存主题、外观风格、侧栏状态、服务地址、窗口尺寸、后端选择、WSL 环境及 Windows 路径 / 端口 / 保留网关等设置。

本地 `selark://app/` 协议提供资源，使用 CSP、上下文隔离和渲染沙箱。受限 IPC 只允许明确列出的 Dashboard API；本机 HTTP 请求设置精确 Host/Origin，不跟随重定向、不使用代理、不放宽后端 CORS。响应大小、请求体、并发队列与超时均有上限。

## 开发与构建

源码结构为同级 `desktop/` 和 `backend/` 两个仓库。Windows x64 构建需要 Node.js 22.12+（本地验证 24.21.0）、Python 3.11+（本地 3.14.7），后端版本必须包含 `desktop-session` 与 `selark-windows.spec`。在 `desktop/` 中：

```powershell
py -m venv ../backend/.venv
../backend/.venv/Scripts/python.exe -m pip install -r ../backend/requirements-build.lock
../backend/.venv/Scripts/python.exe -m pip install --no-build-isolation --no-deps -e ../backend
npm ci
npm run desktop
```

Electron 45 使用显式 `install-electron`，已配置在 `postinstall`。若 GitHub 下载受限，可为当前终端设置 `$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'`；下载仍由 Electron npm 包内置 SHA-256 验证。

```powershell
npm run typecheck
npm test
npm run test:native
npx playwright install chromium
npm run test:browser
npm run test:desktop
npm run package:win
npm run test:windows
$env:SELARK_TEST_PACKAGED='1'
npm run test:windows:desktop
Remove-Item Env:SELARK_TEST_PACKAGED
npm run test:package
node scripts/verify-package.mjs
npm run bench:desktop
```

`npm run dev` 保留原 Web 开发工作台及模拟场景；正式构建排除模拟数据。`test:browser` 在同一 Node 进程中使用系统分配的空闲回环端口管理两个临时 Vite 服务，完成后关闭。可用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指向已有 Edge/Chrome。

真实 WSL 测试需要本机已安装 Selark，显式运行以下命令。两个脚本均强制只读，自动清理自身启动的 Dashboard，不输出真实资源或凭据，不进入默认 CI：

```powershell
npm run test:wsl -- Ubuntu-20.04
npm run test:wsl:desktop -- Ubuntu-20.04
# 在 package:win 完成后验证正式 exe：
$env:SELARK_TEST_PACKAGED='1'
npm run test:wsl:desktop -- Ubuntu-20.04
Remove-Item Env:SELARK_TEST_PACKAGED
```

Windows 运行受操作系统沙箱限制时，请在普通 Windows 终端运行 Electron 测试，保持应用自身的渲染沙箱启用，不要使用 `--no-sandbox`。

`package:win` 先构建原生后端，再生成 NSIS 安装包和 `win-unpacked/`。后端采用目录包，启动无需反复解压；源码、构建版本或锁文件变化时重建，否则先逐文件校验哈希再复用。可通过 `SELARK_BUILD_PYTHON` 指定构建解释器。正式包包含本地 UI、Electron、主进程、preload、WSL 助手、图标，以及 `resources/backend/` 中完整 Python 核心和依赖，排除开发工具与测试数据。

在包含上级四个 CMD 的本地工作目录中，`node scripts/test-launchers.mjs` 使用隔离配置实际验证 CMD 首次启动、恢复上次后端、单实例入口和正常退出。`node scripts/verify-package.mjs` 比对运行时代码与后端清单并生成 `release/SHA256SUMS.txt`；可附加安装包已解出的内容目录，逐文件核对安装内容。两项均不安装到用户系统目录。

后续修改任一仓库后重新执行 `npm run package:win`，CMD 使用当前目录产物，安装版需运行新安装包升级。主动保留的 Windows 网关应先正常停止，避免旧进程占用待升级文件。配置和账本在用户目录，NSIS 卸载不删除它们。CI 同时 checkout 两个仓库，默认固定到本次已验证的后端提交；手动运行可通过 `backend_ref` 选择其他待验证提交。升级时先同步契约，再更新固定引用和本机验收。

## 代码与来源

| 目录 | 用途 |
| --- | --- |
| `electron/` | 主进程、本机 API 请求、preload、WSL 启动助手与测试 |
| `src/desktop/` | 登录页、桌面壳与 API 适配 |
| `src/pages/`、`src/components/`、`src/app/`、`src/lib/` | 与 Web 对齐的五个页面、图表、搜索、详情和管理表单 |
| `src/hooks/useDashboard.ts` | 快照缓存、按需查询、取消与会话失效 |
| `scripts/`、`e2e/` | 构建、验收、性能对比 |
| `contracts/`、`src/api/generated.ts` | 后端 OpenAPI 契约与生成类型 |

完整前端基线：`b0e22be3836ea52bff5918ce4c34e2c82e22b284`，来自后端 `frontend/` 子模块引用与 `dashboard_assets/manifest.json`，记录在 `frontend-baseline.json`。核对的后端：`a985b3e4739583af69a20377abfe82e5910e4d10`。接口契约及策略请求边界已与本次验证版本同步。

0.1.0 / 0.2.0 曾采用 `main` 分支的旧骨架 `f225b54…`，不代表后端已发布的页面。以后更新应先核对后端实际使用的前端提交，再同步源码、契约与验收，不能只跟随前端默认分支。

桌面优化遵守 Selark 的[硬性设计原则](https://github.com/nbcctwya/Selark/blob/a985b3e4739583af69a20377abfe82e5910e4d10/docs/development/design-principles.md)：不产生额外模型调用、提示文本或后台模型心跳。架构参考 Electron 官方[安全](https://www.electronjs.org/docs/latest/tutorial/security)与[性能](https://www.electronjs.org/docs/latest/tutorial/performance)指南。验收范围见 [VALIDATION.md](VALIDATION.md)。
