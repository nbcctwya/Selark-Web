import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { DashboardApi, Filters } from './api/types';
import { FiltersBar } from './components/FiltersBar';
import { RecordsTable } from './components/RecordsTable';
import { UsageSummary } from './components/UsageSummary';
import { date, label } from './components/format';
import { useDashboard } from './hooks/useDashboard';
import { ApplicationsPage } from './pages/ApplicationsPage';
import { ConnectionsPage } from './pages/ConnectionsPage';
import { MonitorPage } from './pages/MonitorPage';

const pages = { overview: '资源概览', connections: '连接与模型', usage: '用量分析', applications: '应用管理', monitor: '运行监控' };
type Page = keyof typeof pages;

export default function App({ api, bootstrap = null, developmentControls }: { api: DashboardApi; bootstrap?: string | null; developmentControls?: ReactNode }) {
  const [page, setPage] = useState<Page>('overview');
  const [filters, setFilters] = useState<Filters>({ period: '7d' });
  const [offset, setOffset] = useState(0);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('selark-theme') === 'dark'; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('selark-theme', dark ? 'dark' : 'light'); } catch { /* Preference only. */ }
  }, [dark]);
  const data = useDashboard(api, bootstrap, filters, offset, errorsOnly);
  const s = data.snapshot;
  const records = s && <RecordsTable records={data.records} applications={s.applications} errorsOnly={errorsOnly} onErrors={value => { setErrorsOnly(value); setOffset(0); }} onOffset={setOffset} />;
  return <>
    <a className="skip" href="#main">跳至主内容</a>
    {developmentControls}
    <div className="workspace">
      <aside className="sidebar"><a className="brand" href="/">Selark<span>个人 AI 资源工作空间</span></a>
        <nav aria-label="主导航">{Object.entries(pages).map(([key, title]) => <button key={key} className={page === key ? 'active' : ''} aria-current={page === key ? 'page' : undefined} onClick={() => { setPage(key as Page); setOffset(0); }}>{title}</button>)}</nav>
        <button className="secondary" onClick={() => setDark(!dark)}>{dark ? '切换浅色' : '切换深色'}</button>
        <p className="muted">本地工作空间</p>
      </aside>
      <main id="main"><header className="page-heading"><div><p className="eyebrow">SELARK WORKSPACE</p><h1>{pages[page]}</h1><p className="muted">{s ? `快照 ${date(s.checked_at)}` : '连接、用量与应用权限'}</p></div>
        <div className="actions"><span className="badge">{s?.capabilities.model_approval ? '模型管理' : '只读'}</span><button disabled={data.loading || data.saving} onClick={() => void data.refresh()}>{data.loading ? '读取中…' : '刷新'}</button></div></header>
        {data.message && <p className="notice" role="status">{data.message}</p>}
        {data.authRequired ? <section className="panel empty"><h2>需要本机管理会话</h2><p>在终端运行 <code>selark dashboard</code>，打开一次性管理链接。</p></section>
          : !s ? <section className="panel empty" role="status">{data.loading ? '正在读取工作空间…' : '暂时无法读取工作空间，请刷新重试。'}</section>
          : <>
            {['overview', 'usage', 'monitor'].includes(page) && <FiltersBar snapshot={s} filters={filters} onChange={value => { setFilters(value); setOffset(0); }} />}
            {page === 'overview' && <><UsageSummary usage={s.usage} /><section className="panel"><h2>资源池</h2><div className="resource-list">{s.connections.map(c => <button className="resource secondary" key={c.id} onClick={() => setPage('connections')}><strong>{c.name}</strong><span>{label(c.resource_type)} · {c.models.length} 个已启用模型</span><small>历史验证：{label(c.verification.state)}</small></button>)}</div>{!s.connections.length && <p className="empty">还没有连接。</p>}</section>{records}</>}
            {page === 'connections' && <ConnectionsPage snapshot={s} saving={data.saving} onChange={data.setModelApproval} />}
            {page === 'usage' && <><UsageSummary usage={s.usage} />{records}</>}
            {page === 'applications' && <ApplicationsPage snapshot={s} />}
            {page === 'monitor' && <><MonitorPage snapshot={s} logs={data.logs} backups={data.backups} />{records}</>}
          </>}
      </main>
    </div>
  </>;
}
