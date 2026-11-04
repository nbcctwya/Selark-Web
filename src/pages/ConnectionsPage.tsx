import { useState } from 'react';
import type { ModelApproval, Snapshot } from '../api/types';
import { label } from '../components/format';

export function ConnectionsPage({ snapshot, saving, onChange }: { snapshot: Snapshot; saving: boolean; onChange: (change: ModelApproval) => Promise<void> }) {
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState('all');
  return <>
    <div className="filters"><label>搜索模型<input value={search} onChange={e => setSearch(e.target.value)} placeholder="模型名称" /></label>
      <label>启用状态<select value={scope} onChange={e => setScope(e.target.value)}><option value="all">全部</option><option value="enabled">已启用</option><option value="disabled">未启用</option></select></label>
    </div>
    {!snapshot.connections.length && <section className="panel empty">还没有连接。</section>}
    {snapshot.connections.map(connection => <section className="panel" key={connection.id}>
      <div className="section-heading"><div><h2>{connection.name}</h2><p className="muted">{label(connection.resource_type)} · {connection.id}</p></div><span className="badge">{connection.enabled ? '连接已启用' : '连接已停用'}</span></div>
      <p className="muted">发现 {connection.model_catalog.counts.discovered} · 启用 {connection.model_catalog.counts.approved} · 应用获权 {connection.model_catalog.counts.application_authorized} · 历史验证 {connection.model_catalog.counts.historically_verified}</p>
      <div className="table-scroll"><table><thead><tr><th>模型</th><th>启用状态</th><th>应用授权</th><th>历史能力</th><th>操作</th></tr></thead>
        <tbody>{connection.model_catalog.models.filter(m => m.id.toLowerCase().includes(search.toLowerCase()) && (scope === 'all' || m.approved === (scope === 'enabled'))).map(model => <tr key={model.id}>
          <td>{model.id}{model.default && <small>默认模型</small>}</td><td>{model.approved ? '已启用' : '未启用'}</td><td>{model.effective_applications.length} 个应用</td><td>{model.verified_capabilities.join(' / ') || '尚无模型级证据'}</td>
          <td>{snapshot.capabilities.model_approval ? <button disabled={saving} className="secondary" onClick={() => {
            const clearDefault = model.approved && model.default;
            if (clearDefault && !window.confirm(`禁用 ${model.id} 会同时清除默认模型。确认继续？`)) return;
            void onChange({ connection_id: connection.id, model: model.id, enabled: !model.approved, revision: connection.model_catalog.approval_revision, clear_default: clearDefault });
          }}>{model.approved ? '禁用' : '启用'}</button> : <span className="muted">只读</span>}</td>
        </tr>)}</tbody></table></div>
      <p className="muted">历史验证不代表当前可用性。模型启用和应用授权分别管理。</p>
    </section>)}
  </>;
}
