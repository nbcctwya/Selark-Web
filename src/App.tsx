import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { DashboardApi, Filters } from './api/types';
import { CommandPalette } from './components/CommandPalette';
import type { Command } from './components/CommandPalette';
import { FiltersBar } from './components/FiltersBar';
import { Icon, Mark } from './components/Icon';
import type { IconName } from './components/Icon';
import { ToastProvider } from './components/Overlay';
import { ManageContext, resolveCapabilities } from './app/manage';
import type { Manage } from './app/manage';
import { RecordsPanel } from './components/Records';
import { Button, Empty, Kbd, Pill, Segmented, Skeleton, useNow } from './components/ui';
import { useDashboard } from './hooks/useDashboard';
import { relative, shortTime } from './lib/format';
import { ApplicationsPage } from './pages/ApplicationsPage';
import { ConnectionsPage } from './pages/ConnectionsPage';
import { MonitorPage } from './pages/MonitorPage';
import { OverviewPage, UsagePage } from './pages/UsagePages';

type Page = 'overview' | 'connections' | 'usage' | 'applications' | 'monitor';
type ThemePref = 'light' | 'dark' | 'system';
const pages: { key: Page; title: string; short: string; icon: IconName; eyebrow: string; description: string }[] = [
  { key: 'overview', title: '资源概览', short: '概览', icon: 'overview', eyebrow: 'Overview', description: '连接、用量与运行状态，一屏尽览。' },
  { key: 'connections', title: '连接与模型', short: '连接', icon: 'connections', eyebrow: 'Connections', description: '发现、启用、应用授权与历史验证——四层状态分开呈现。' },
  { key: 'usage', title: '用量分析', short: '用量', icon: 'usage', eyebrow: 'Usage', description: '按时间、应用、连接与模型交叉查看 Token、费用与成功率。' },
  { key: 'applications', title: '应用管理', short: '应用', icon: 'apps', eyebrow: 'Applications', description: '调用方身份、资源权限与 UTC 今日配额。' },
  { key: 'monitor', title: '运行监控', short: '监控', icon: 'monitor', eyebrow: 'Monitor', description: '本机网关健康、日志、备份与异常调用。' },
];
const AUTO_REFRESH_MS = 30000;

function readTheme(): ThemePref {
  try { const v = localStorage.getItem('selark-theme'); return v === 'light' || v === 'dark' ? v : 'system'; } catch { return 'system'; }
}
const systemDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
const typing = (el: Element | null) => !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement).isContentEditable);

export default function App(props: { api: DashboardApi; bootstrap?: string | null; developmentControls?: ReactNode }) {
  return <ToastProvider><Workspace {...props} /></ToastProvider>;
}

function Workspace({ api, bootstrap = null, developmentControls }: { api: DashboardApi; bootstrap?: string | null; developmentControls?: ReactNode }) {
  const [page, setPage] = useState<Page>('overview');
  const [filters, setFilters] = useState<Filters>({ period: '7d' });
  const [offset, setOffset] = useState(0);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [openConnection, setOpenConnection] = useState<string | null>(null);
  const [openApplication, setOpenApplication] = useState<string | null>(null);
  const [palette, setPalette] = useState(false);
  const [themePref, setThemePref] = useState<ThemePref>(readTheme);
  const [dark, setDark] = useState(() => themePref === 'dark' || (themePref === 'system' && systemDark()));
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const query = useMemo(() => ({ offset, errors: errorsOnly }), [offset, errorsOnly]);
  const data = useDashboard(api, bootstrap, filters, query);
  const [creating, setCreating] = useState<'connection' | 'application' | null>(null);
  const s = data.snapshot;
  const caps = useMemo(() => resolveCapabilities(data.capabilities, s), [data.capabilities, s]);
  const manage = useMemo<Manage>(() => ({ api: data.api, run: data.run, saving: data.saving, ...caps }), [data.api, data.run, data.saving, caps]);
  const now = useNow();
  const meta = pages.find(p => p.key === page)!;

  useEffect(() => {
    const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
    const apply = () => setDark(themePref === 'dark' || (themePref === 'system' && Boolean(media?.matches)));
    apply();
    try { if (themePref === 'system') localStorage.removeItem('selark-theme'); else localStorage.setItem('selark-theme', themePref); } catch { /* Preference only. */ }
    media?.addEventListener('change', apply);
    return () => media?.removeEventListener('change', apply);
  }, [themePref]);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  useEffect(() => { document.title = `${meta.title} · Selark`; }, [meta.title]);

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    addEventListener('online', on); addEventListener('offline', off);
    return () => { removeEventListener('online', on); removeEventListener('offline', off); };
  }, []);

  // A 401 clears every resource value; also drop any open detail so nothing stale stays on screen.
  useEffect(() => { if (data.authRequired) { setOpenConnection(null); setOpenApplication(null); setCreating(null); } }, [data.authRequired]);

  const go = useCallback((next: Page, id?: string) => {
    setPage(next); setOffset(0); setErrorsOnly(next === 'monitor');
    setOpenConnection(next === 'connections' && id ? id : null);
    setOpenApplication(next === 'applications' && id ? id : null);
    setCreating(null);
    document.getElementById('main')?.focus({ preventScroll: true });
    scrollTo({ top: 0 });
  }, []);
  const changeFilters = useCallback((value: Filters) => { setFilters(value); setOffset(0); }, []);
  const { refresh, loading } = data;

  // Auto refresh while visible and idle; pauses during dialogs, typing, offline and in-flight reads.
  useEffect(() => {
    if (!s || data.authRequired) return;
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible' || loading || !navigator.onLine) return;
      if (document.querySelector('dialog[open]') || typing(document.activeElement)) return;
      void refresh();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [s, data.authRequired, loading, refresh]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPalette(true); return; }
      if (event.metaKey || event.ctrlKey || event.altKey || typing(document.activeElement) || document.querySelector('dialog[open]')) return;
      const index = Number(event.key);
      if (index >= 1 && index <= pages.length) { event.preventDefault(); go(pages[index - 1].key); }
      else if (event.key === '/') { event.preventDefault(); setPalette(true); }
      else if (event.key.toLowerCase() === 'r') { event.preventDefault(); void refresh(); }
    }
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [go, refresh]);

  const commands = useMemo<Command[]>(() => [
    ...pages.map((p, i) => ({ id: `p:${p.key}`, group: '页面', title: p.title, hint: p.description, icon: p.icon, shortcut: String(i + 1), run: () => go(p.key) })),
    { id: 'a:refresh', group: '操作', title: '刷新数据', icon: 'refresh', shortcut: 'R', run: () => void refresh() },
    ...(caps.can.connection_management ? [{ id: 'a:new-connection', group: '操作', title: '新建连接', icon: 'connections' as const, keywords: 'create add connection', run: () => { go('connections'); setCreating('connection'); } }] : []),
    ...(caps.can.application_management ? [{ id: 'a:new-application', group: '操作', title: '新建应用', icon: 'apps' as const, keywords: 'create add application token', run: () => { go('applications'); setCreating('application'); } }] : []),
    { id: 'a:light', group: '操作', title: '使用浅色主题', icon: 'sun', run: () => setThemePref('light') },
    { id: 'a:dark', group: '操作', title: '使用深色主题', icon: 'moon', run: () => setThemePref('dark') },
    { id: 'a:system', group: '操作', title: '主题跟随系统', icon: 'system', run: () => setThemePref('system') },
  ], [go, refresh, caps.can.connection_management, caps.can.application_management]);

  const showFilters = Boolean(s) && (page === 'overview' || page === 'usage' || page === 'monitor');
  const records = s && <RecordsPanel snapshot={s} records={data.records} failure={data.failures.records} loading={data.recordsLoading}
    errorsOnly={errorsOnly} onErrors={value => { setErrorsOnly(value); setOffset(0); }} onOffset={setOffset}
    compact={page === 'overview'} onSeeAll={page === 'overview' ? () => go('usage') : undefined} />;
  const partial = s ? [...s.issues, ...(Object.values(data.failures).some(Boolean) ? ['部分数据读取失败，可刷新重试。'] : [])] : [];
  const anyWrite = caps.can.connection_management || caps.can.application_management || caps.can.model_approval;
  const readOnly = Boolean(s) && !anyWrite;

  return <ManageContext.Provider value={manage}>
    <a className="skip" href="#main">跳至主内容</a>
    {developmentControls}
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Selark 首页" onClick={event => { event.preventDefault(); go('overview'); }}>
          <Mark size={32} /><span>Selark<small>Personal AI Workspace</small></span>
        </a>
        <button type="button" className="search-trigger" onClick={() => setPalette(true)}>
          <Icon name="search" size={15} /><span>搜索与跳转</span><Kbd>⌘K</Kbd>
        </button>
        <p className="nav-caption">工作空间</p>
        <nav aria-label="主导航" className="nav">
          {pages.map((p, i) => <button key={p.key} type="button" aria-label={p.title} aria-current={page === p.key ? 'page' : undefined}
            className={page === p.key ? 'active' : ''} onClick={() => go(p.key)}>
            <Icon name={p.icon} size={18} /><span className="nav-title">{p.title}</span><span className="nav-short" aria-hidden="true">{p.short}</span><span className="nav-key" aria-hidden="true">{i + 1}</span>
          </button>)}
        </nav>
        <div className="sidebar-foot">
          <div className="local-card">
            <Icon name="shield" size={17} />
            <div><strong>数据留在本机</strong><p>独立管理会话 · 同源访问 · 不探测供应商</p></div>
          </div>
          <Segmented label="主题" size="sm" value={themePref} onChange={setThemePref} options={[
            { value: 'light', label: <Icon name="sun" size={15} title="浅色" />, title: '浅色' },
            { value: 'dark', label: <Icon name="moon" size={15} title="深色" />, title: '深色' },
            { value: 'system', label: <Icon name="system" size={15} title="跟随系统" />, title: '跟随系统' },
          ]} />
          <p className="version">Selark {s?.version ?? ''}<span>Dashboard</span></p>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <div className="topbar-brand"><Mark size={26} /><span>Selark</span></div>
          <p className="crumb" aria-hidden="true"><span>工作空间</span><Icon name="chevronRight" size={13} /><b>{meta.title}</b></p>
          <div className="topbar-right">
            {s && <Pill tone={readOnly ? 'neutral' : 'info'} title={readOnly ? caps.why.connection_management : caps.can.model_discovery ? '可管理连接、模型与应用' : '离线模式：可本地管理，模型发现已关闭'}>{readOnly ? '只读' : caps.can.model_discovery ? '本机管理' : '离线管理'}</Pill>}
            <span className="freshness" role="status">{data.authRequired ? '未登录' : loading && !s ? '读取中…' : data.loadedAt ? <>{data.stale && <Icon name="alert" size={13} />}{relative(new Date(data.loadedAt).toISOString(), now)}更新</> : ''}</span>
            <Button variant="ghost" icon="search" aria-label="搜索与跳转" className="only-mobile" onClick={() => setPalette(true)} />
            <Button variant="ghost" icon={dark ? 'sun' : 'moon'} aria-label={dark ? '切换浅色' : '切换深色'} className="only-mobile" onClick={() => setThemePref(dark ? 'light' : 'dark')} />
            <Button icon="refresh" className={`refresh${loading ? ' spinning' : ''}`} disabled={loading || Boolean(data.saving)} onClick={() => void refresh()}>
              <span className="refresh-label">{loading ? '读取中…' : '刷新'}</span>
            </Button>
          </div>
          {loading && <span className="progress" aria-hidden="true" />}
        </header>

        <main id="main" tabIndex={-1}>
          <header className="page-head">
            <p className="eyebrow">{meta.eyebrow}</p>
            <h1>{meta.title}</h1>
            <p className="page-desc">{meta.description}</p>
          </header>

          {!online && <div className="banner banner-warn" role="status"><Icon name="wifiOff" size={17} /><p>浏览器当前离线。{s ? `页面显示的是 ${shortTime(s.checked_at)} 的快照，` : ''}自动刷新已暂停。</p></div>}
          {data.stale && s && <div className="banner banner-warn" role="alert"><Icon name="alert" size={17} /><p><b>读取失败：</b>{data.error} 下方为 {shortTime(s.checked_at)} 的旧快照，可能已过时。</p><Button size="sm" onClick={() => void refresh()}>重试</Button></div>}
          {partial.length > 0 && <div className="banner banner-info" role="status"><Icon name="info" size={17} /><p>{partial.join(' ')}</p></div>}
          {readOnly && (page === 'connections' || page === 'applications') && <div className="banner banner-muted" role="status"><Icon name="lock" size={17} /><p>{caps.why.connection_management} 页面只展示当前状态。</p></div>}
          {s && !readOnly && !caps.can.model_discovery && page === 'connections' && <div className="banner banner-muted" role="status"><Icon name="wifiOff" size={17} /><p>{caps.why.model_discovery}</p></div>}

          {data.authRequired ? <AuthRequired message={data.authMessage} />
            : !s ? (loading ? <Loading /> : <section className="panel"><Empty icon="alert" tone="error" title="暂时无法读取工作空间，请刷新重试。">{data.error}<p><Button variant="primary" icon="refresh" onClick={() => void refresh()}>重新读取</Button></p></Empty></section>)
            : <div className={`page page-${page}`} key={page}>
              {showFilters && page !== 'monitor' && <FiltersBar snapshot={s} filters={filters} onChange={changeFilters} />}
              {page === 'overview' && <OverviewPage snapshot={s} go={go} records={records} />}
              {page === 'connections' && <ConnectionsPage snapshot={s} openId={openConnection} onOpen={setOpenConnection} creating={creating === 'connection'} onCreating={open => setCreating(open ? 'connection' : null)} />}
              {page === 'usage' && <UsagePage snapshot={s} records={records} />}
              {page === 'applications' && <ApplicationsPage snapshot={s} openId={openApplication} onOpen={setOpenApplication} creating={creating === 'application'} onCreating={open => setCreating(open ? 'application' : null)} />}
              {page === 'monitor' && <><MonitorPage snapshot={s} logs={data.logs} backups={data.backups} failures={data.failures} /><FiltersBar snapshot={s} filters={filters} onChange={changeFilters} />{records}</>}
            </div>}

          <footer className="foot"><span><span className="live-dot" />仅限本机 · 无供应商探测</span><span>历史有据可查，未知如实呈现。</span></footer>
        </main>
      </div>
    </div>
    <CommandPalette open={palette} onClose={() => setPalette(false)} base={commands} snapshot={s} go={go} />
  </ManageContext.Provider>;
}

function AuthRequired({ message }: { message: string }) {
  return <section className="auth" aria-labelledby="auth-title">
    <span className="auth-icon"><Icon name="lock" size={26} /></span>
    <h2 id="auth-title">需要本机管理会话</h2>
    <p className="auth-msg">{message || '请从终端打开 selark dashboard 的一次性管理链接。'}</p>
    <div className="auth-steps">
      <div><span>1</span><p>在本机终端运行<code>selark dashboard</code></p></div>
      <div><span>2</span><p>打开终端显示的一次性链接（5 分钟内有效，仅可使用一次）</p></div>
      <div><span>3</span><p>管理会话最长 8 小时；重启 Dashboard 后旧会话失效</p></div>
    </div>
    <p className="auth-note"><Icon name="shield" size={14} />出于安全考虑，页面已清除所有已展示的资源数据。</p>
  </section>;
}

function Loading() {
  return <div className="loading" role="status" aria-label="正在读取工作空间">
    <span className="sr-only">正在读取工作空间…</span>
    <div className="band">{[0, 1, 2, 3].map(i => <div key={i} className="band-item"><Skeleton className="sk-line" /><Skeleton className="sk-big" /></div>)}</div>
    <div className="metrics">{[0, 1, 2, 3, 4].map(i => <div key={i} className="metric"><Skeleton className="sk-line" /><Skeleton className="sk-big" /><Skeleton className="sk-line short" /></div>)}</div>
    <div className="grid-main"><div className="panel span-2"><Skeleton className="sk-chart" /></div><div className="panel"><Skeleton className="sk-chart" /></div></div>
  </div>;
}
