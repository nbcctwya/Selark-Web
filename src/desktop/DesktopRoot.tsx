import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import App from '../App';
import { Icon } from './DesktopIcons';
import { Icon as AppIcon, Mark } from '../components/Icon';
import { AppearancePicker, appearances, readAppearance } from './Appearance';
import './desktop.css';
import { createDesktopApi } from './bridge';
import type { DesktopConfig, NativeSettings, WslSettings } from './bridge';

const bridge = window.selark!;
const defaults: WslSettings = { distribution: '', executable: '', configDir: '', autoConnect: true };
const nativeDefaults: NativeSettings = { configDir: '', initialPort: 8788, autoConnect: true, readOnly: false, keepRunning: false };

export default function DesktopRoot() {
  const [config, setConfig] = useState<DesktopConfig | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState('');
  const [appearance, setAppearance] = useState(readAppearance);
  const [choosingAppearance, setChoosingAppearance] = useState(false);
  const [choosingConnection, setChoosingConnection] = useState(false);
  const [preferredMode, setPreferredMode] = useState<'windows' | 'wsl' | undefined>();
  const [compact, setCompact] = useState(() => { try { return localStorage.getItem('selark-compact-sidebar') === 'true'; } catch { return false; } });
  const operation = useRef(0);
  const lastRenewal = useRef(0);
  const initialization = useRef<Promise<DesktopConfig> | null>(null);
  const api = useMemo(() => createDesktopApi(bridge), [revision]);

  useEffect(() => {
    document.documentElement.dataset.desktopStyle = appearance;
    try { localStorage.setItem('selark-appearance', appearance); } catch { /* Appearance is optional. */ }
  }, [appearance]);
  useEffect(() => {
    try { localStorage.setItem('selark-compact-sidebar', String(compact)); } catch { /* Preference only. */ }
  }, [compact]);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      let preference = 'system';
      try { preference = localStorage.getItem('selark-theme') ?? 'system'; } catch { /* Use the system theme. */ }
      const theme = preference === 'light' || preference === 'dark' ? preference : 'system';
      document.documentElement.dataset.theme = theme === 'dark' || (theme === 'system' && media.matches) ? 'dark' : 'light';
      bridge.theme(theme);
    };
    apply(); media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === ',') { event.preventDefault(); setChoosingAppearance(true); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b' && config?.connected && !document.querySelector('dialog[open]') && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || (event.target as HTMLElement)?.isContentEditable)) {
        event.preventDefault(); setCompact(value => !value);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [config?.connected]);

  const connectManaged = useCallback(async (mode: 'windows' | 'wsl', settings?: NativeSettings | WslSettings, renewal = false) => {
    const generation = ++operation.current;
    setConnecting(true); setError(''); setNotice('');
    setConfig(value => value && { ...value, connected: false, connectionMode: mode });
    try {
      const value = mode === 'windows' ? await bridge.startNative(settings as NativeSettings | undefined) : await bridge.startWsl(settings as WslSettings | undefined);
      if (generation !== operation.current) return;
      setRevision(v => v + 1); setConfig(value); setChoosingConnection(false);
      if (renewal) setNotice('管理会话已自动恢复。如刚才正在保存，请核对操作结果。');
    } catch (error) { if (generation === operation.current) setError(cleanError(error)); }
    finally { if (generation === operation.current) setConnecting(false); }
  }, []);
  useEffect(() => {
    let active = true;
    initialization.current ??= bridge.config();
    void initialization.current.then(value => {
      if (!active) return;
      setConfig(value);
      if (!value.connected && !value.chooseBackend) {
        if (value.connectionMode === 'wsl' && value.wsl?.autoConnect) void connectManaged('wsl', value.wsl);
        if (value.connectionMode === 'windows' && value.windows?.autoConnect) void connectManaged('windows', value.windows);
      }
    }).catch(() => { if (active) setError('桌面组件初始化失败，请重新启动应用。'); });
    return () => { active = false; };
  }, [connectManaged]);
  useEffect(() => bridge.onChooseBackend(mode => {
    setPreferredMode(mode === 'choose' ? undefined : mode);
    setChoosingConnection(true); setError('');
  }), []);
  async function cancel() {
    operation.current++; setError('正在取消连接…');
    try { await bridge.cancelWsl(); setError('连接已取消，可随时重试。'); }
    catch (error) { setError(cleanError(error)); }
    finally { setConnecting(false); }
  }
  const renew = useCallback(() => {
    if (Date.now() - lastRenewal.current < 30000) {
      setConfig(value => value && { ...value, connected: false });
      setError('会话再次失效，请检查所选后端后重新连接。');
      void bridge.disconnect();
      return;
    }
    lastRenewal.current = Date.now();
    const mode = config?.connectionMode === 'windows' ? 'windows' : 'wsl';
    void connectManaged(mode, mode === 'windows' ? config?.windows : config?.wsl, true);
  }, [connectManaged, config?.connectionMode, config?.windows, config?.wsl]);
  const workspaceLabel = config?.connectionMode === 'windows' ? 'Windows 本地' : config?.connectionMode === 'wsl' ? `WSL · ${config.wsl?.distribution || '默认环境'}` : '本机 Dashboard';
  const chooseConnection = () => { setPreferredMode(undefined); setError(''); setChoosingConnection(true); };
  return <div className="desktop-shell" data-navigation={compact ? 'compact' : 'expanded'}>
    <header className="titlebar" aria-label="应用标题栏">
      <div className="titlebar-brand">
        {config?.connected && <button className="titlebar-button navigation-toggle" aria-label={compact ? '展开侧栏' : '收起侧栏'} aria-expanded={!compact} title="切换侧栏 (Ctrl+B)" onClick={() => setCompact(value => !value)}><AppIcon name={appearance === 'macos' ? 'sidebar' : 'menu'} size={18} /></button>}
        <Mark size={22} /><span>Selark</span>
      </div>
      <div id="desktop-heading-slot" className="titlebar-heading-slot" />
      <div id="desktop-search-slot" className="titlebar-search-slot" />
      {config?.connected && <button className="titlebar-button backend-trigger" aria-label="切换后端" title="切换 Windows / WSL 后端" onClick={chooseConnection}><Icon name="connections" size={16}/><span>{workspaceLabel}</span></button>}
      <button className="titlebar-button appearance-trigger" aria-label="外观设置" title="外观设置 (Ctrl+,)" onClick={() => setChoosingAppearance(true)}><AppIcon name="layers" size={16} /><span>外观</span><small>{appearances.find(item => item.id === appearance)?.name}</small></button>
    </header>
    {!config ? <div className="empty">{error || '正在打开工作空间…'}</div> : config.connected && !choosingConnection
      ? <App key={revision} api={api} endpoint={config.endpoint} workspaceLabel={workspaceLabel} desktopVersion={config.version} desktopUnifiedToolbar={appearance === 'macos'} onConnectionSettings={chooseConnection} onSessionExpired={config.connectionMode === 'windows' || config.connectionMode === 'wsl' ? renew : undefined} connectionNotice={notice} />
      : <ConnectView config={config} preferredMode={preferredMode} connecting={connecting} error={error} onStart={settings => void connectManaged('wsl', settings)} onStartNative={settings => void connectManaged('windows', settings)} onCancel={() => void cancel()} onClose={() => setChoosingConnection(false)} onConnected={value => { setError(''); setNotice(''); setRevision(v => v + 1); setConfig(value); setChoosingConnection(false); }} />}
    <AppearancePicker open={choosingAppearance} value={appearance} onChange={setAppearance} onClose={() => setChoosingAppearance(false)} />
  </div>;
}

function ConnectView({ config, preferredMode, connecting, error, onStart, onStartNative, onCancel, onClose, onConnected }: { config: DesktopConfig; preferredMode?: 'windows' | 'wsl'; connecting: boolean; error: string; onStart: (settings: WslSettings) => void; onStartNative: (settings: NativeSettings) => void; onCancel: () => void; onClose: () => void; onConnected: (value: DesktopConfig) => void }) {
  const [mode, setMode] = useState<'windows' | 'wsl' | 'manual'>(preferredMode ?? config.connectionMode ?? 'windows');
  const [options, setOptions] = useState<WslSettings>(config.wsl ?? defaults);
  const [nativeOptions, setNativeOptions] = useState<NativeSettings>(config.windows ?? nativeDefaults);
  const [distributions, setDistributions] = useState<string[] | null>(null);
  const [wslMessage, setWslMessage] = useState('');
  const [link, setLink] = useState('');
  const [address, setAddress] = useState(config.endpoint);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const busy = connecting || working;
  useEffect(() => { if (preferredMode && !busy) setMode(preferredMode); }, [preferredMode, busy]);
  useEffect(() => {
    if (mode !== 'wsl' || distributions !== null) return;
    let active = true;
    void bridge.listWsl().then(values => {
      if (!active) return;
      setDistributions(values);
      if (values.length === 1) setOptions(current => ({ ...current, distribution: current.distribution || values[0] }));
      if (!values.length) setWslMessage('尚未检测到 WSL 环境，可使用手动连接。');
    }).catch(error => { if (active) { setDistributions([]); setWslMessage(cleanError(error)); } });
    return () => { active = false; };
  }, [mode, distributions]);
  async function connect(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setWorking(true); setMessage('');
    const value = link; setLink('');
    try { onConnected(await bridge.connect(value)); }
    catch (error) { onConnected({ ...await bridge.config(), connected: false }); setMessage(cleanError(error)); }
    finally { setWorking(false); }
  }
  async function probe() {
    setWorking(true); setMessage('');
    try { const result = await bridge.probe(address); setMessage(result.reachable ? '本机服务可达。请粘贴一次性管理链接登录。' : '该地址未返回 Dashboard，请检查端口。'); }
    catch (error) { setMessage(cleanError(error)); }
    finally { setWorking(false); }
  }
  return <main className="welcome">
    <section className="welcome-story"><Mark size={52} /><h1>你的本地 AI<br/>工作空间。</h1><p className="welcome-lead">连接模型，管理应用。<br/>运行在哪里，由你选择。</p><div className="welcome-features">{[['connections','Windows 与 WSL','记住选择，下次打开直接进入'],['usage','独立工作空间','各自保存连接、用量与应用'],['shield','本机管理','临时会话，管理凭证不落盘']].map(([icon,title,description]) => <div key={title}><Icon name={icon}/><span><strong>{title}</strong><small>{description}</small></span></div>)}</div><p className="welcome-foot">SELARK DESKTOP <span>·</span> {config.version}</p></section>
    <section className="connect-card panel"><span className="connection-symbol"><Icon name="connections" size={28}/></span><h2>连接到你的工作空间</h2>
      <div className="connection-tabs" aria-label="连接方式"><button className={mode === 'windows' ? 'selected' : ''} disabled={busy} onClick={() => { setMode('windows'); setMessage(''); }}>Windows 本地</button><button className={mode === 'wsl' ? 'selected' : ''} disabled={busy} onClick={() => { setMode('wsl'); setMessage(''); }}>WSL 自动连接</button><button className={mode === 'manual' ? 'selected' : ''} disabled={busy} onClick={() => { setMode('manual'); setMessage(''); }}>手动连接</button></div>
      {mode === 'windows' ? <form onSubmit={event => { event.preventDefault(); if (!busy) onStartNative(nativeOptions); }}>
        <p className="muted">使用应用内置的 Windows 后端。首次打开会创建本地工作空间，随后在「连接与模型」中添加服务。</p>
        <div className="native-summary"><span className="native-badge">原生运行 · 无需 WSL 或 Python</span><small>连接、账本与配置保存在 Windows 本机</small></div>
        <label className="check auto-connect"><input type="checkbox" checked={nativeOptions.autoConnect} disabled={busy} onChange={event => setNativeOptions({ ...nativeOptions, autoConnect: event.target.checked })}/>下次打开应用时自动连接</label>
        <button className="connect-submit" disabled={busy}>{connecting ? '正在启动 Windows 后端…' : '打开 Windows 工作空间'}<Icon name="arrow"/></button>
        {connecting && <button type="button" className="secondary" onClick={onCancel}>取消连接</button>}
        <details><summary>Windows 设置</summary><label>Windows 配置目录<input value={nativeOptions.configDir} disabled={busy} placeholder={config.nativeConfigDir || '使用 Windows 默认目录'} onChange={event => setNativeOptions({ ...nativeOptions, configDir: event.target.value })}/></label><label>新工作空间网关端口<input type="number" min="1024" max="65535" value={nativeOptions.initialPort} disabled={busy} onChange={event => setNativeOptions({ ...nativeOptions, initialPort: Number(event.target.value) })}/></label><p className="muted">默认 8788，与 WSL 常用的 8787 分开。已有工作空间沿用其原端口。</p><label className="check auto-connect"><input type="checkbox" checked={nativeOptions.readOnly} disabled={busy} onChange={event => setNativeOptions({ ...nativeOptions, readOnly: event.target.checked })}/>以只读模式连接已有工作空间</label><label className="check auto-connect"><input type="checkbox" checked={nativeOptions.keepRunning} disabled={busy} onChange={event => setNativeOptions({ ...nativeOptions, keepRunning: event.target.checked })}/>退出或切换后保留 Windows 网关</label><p className="muted">需要让其他应用持续调用时开启。重新连接会复用正在运行的网关。</p></details>
        {config.nativeInfo && <p className="muted native-current">网关：{config.nativeInfo.gatewayUrl} · {config.nativeInfo.ownsGateway ? '由桌面启动' : '连接已有服务'}</p>}
      </form> : mode === 'wsl' ? <form onSubmit={event => { event.preventDefault(); if (!busy) onStart(options); }}>
        <p className="muted">选择已安装 Selark 的 WSL 环境。应用会自动启动管理服务并登录。</p>
        <label>WSL 环境<select aria-label="WSL 环境" value={options.distribution} disabled={busy} onChange={event => setOptions({ ...options, distribution: event.target.value })}><option value="">系统默认（自动识别）</option>{options.distribution && !distributions?.includes(options.distribution) && <option value={options.distribution}>{options.distribution}</option>}{distributions?.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
        {wslMessage && <p className="muted">{wslMessage}</p>}
        <label className="check auto-connect"><input type="checkbox" checked={options.autoConnect} disabled={busy} onChange={event => setOptions({ ...options, autoConnect: event.target.checked })}/>下次打开应用时自动连接</label>
        <button className="connect-submit" disabled={busy}>{connecting ? '正在启动并连接 WSL…' : '连接 WSL 工作空间'}<Icon name="arrow"/></button>
        {connecting && <button type="button" className="secondary" onClick={onCancel}>取消连接</button>}
        <details><summary>高级设置</summary><label>Selark 程序路径<input value={options.executable} disabled={busy} placeholder="自动查找，例如 ~/.local/bin/selark" onChange={event => setOptions({ ...options, executable: event.target.value })}/></label><label>配置目录<input value={options.configDir} disabled={busy} placeholder="使用 Selark 默认配置" onChange={event => setOptions({ ...options, configDir: event.target.value })}/></label><label className="check auto-connect"><input type="checkbox" checked={options.readOnly ?? false} disabled={busy} onChange={event => setOptions({ ...options, readOnly: event.target.checked })}/>以只读模式连接</label><p className="muted">使用虚拟环境或自定义配置时填写 WSL 内的路径。保存后无需重复填写。</p></details>
      </form> : <>
        <p className="muted">连接已由你启动的 Dashboard，粘贴终端里的完整一次性管理链接。</p><div className="command"><code>selark dashboard --no-open</code></div>
        <form onSubmit={event => void connect(event)}><label>一次性管理链接<input type="password" autoComplete="off" spellCheck={false} value={link} onChange={event => setLink(event.target.value)} placeholder="http://127.0.0.1:8790/#login=…" required disabled={busy}/></label><p className="muted">链接在 5 分钟内有效，只能使用一次。</p><button className="connect-submit" disabled={busy || !link.trim()}>{working ? '正在连接…' : '打开工作空间'}<Icon name="arrow"/></button></form>
        <details><summary>连接诊断</summary><label>Dashboard 地址<input value={address} onChange={event => setAddress(event.target.value)} disabled={busy}/></label><button className="secondary" disabled={busy} onClick={() => void probe()}>检查本机服务</button><p className="muted">默认地址为 http://127.0.0.1:8790。服务恢复后可重新连接。</p></details>
      </>}
      {(error || message) && <p className="notice" role="status">{error || message}</p>}
      {config.connected && !busy && <button className="secondary return-workspace" onClick={onClose}>返回当前工作空间</button>}
      <div className="privacy-note"><Icon name="shield" size={15}/><span>{mode === 'windows' ? '默认退出或切换时停止本次启动的网关，已有服务会保留。' : mode === 'wsl' ? '临时管理服务随窗口关闭，模型网关继续运行。' : '管理凭证仅保存在本次运行的内存中。'}</span></div>
    </section>
  </main>;
}

function cleanError(error: unknown) {
  return (error instanceof Error ? error.message : '连接失败，请重试。').replace(/^Error invoking remote method '[^']+': Error: /, '');
}
