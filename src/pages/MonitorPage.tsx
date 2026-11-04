import type { Backups, Logs, Snapshot } from '../api/types';
import { Icon } from '../components/Icon';
import { DefinitionList, Empty, Panel, Pill, Ring, Tag, Unknown } from '../components/ui';
import { limitLabels } from '../lib/domain';
import { dateTime, duration, label, number, relative, shortTime, tone } from '../lib/format';

export function GatewayPill({ snapshot }: { snapshot: Snapshot }) {
  const s = snapshot.service;
  const text = s.state === 'running' ? '网关运行中' : s.reachable === false ? '网关离线' : label(s.state);
  return <Pill tone={s.state === 'running' ? 'good' : s.reachable === false ? 'bad' : tone(s.state)}>{text}</Pill>;
}

export function MonitorPage({ snapshot, logs, backups, failures }: { snapshot: Snapshot; logs: Logs | null; backups: Backups | null; failures: { logs: string | null; backups: string | null } }) {
  const s = snapshot.service, c = s.capacity ?? {}, st = s.storage ?? {};
  const known = s.reachable === true;
  const maxPending = snapshot.limits?.max_pending_records;
  return <>
    <section className={`gateway${known ? '' : ' is-unknown'}`} aria-label="本机网关">
      <div className="gateway-main">
        <span className={`gateway-orb ${s.state === 'running' ? 'good' : s.reachable === false ? 'bad' : 'unknown'}`} aria-hidden="true"><Icon name="server" size={22} /></span>
        <div>
          <p className="eyebrow">本机网关 · /health</p>
          <h2>{s.state === 'running' ? '运行中' : s.reachable === false ? '离线或响应无效' : label(s.state)}</h2>
          <p className="gateway-sub">{known ? '实时并发、队列与落账来自本机健康接口。' : '无法读取实时状态：并发、队列等值未知，不代表服务停止或队列为零。'}历史记录仍可查看。</p>
        </div>
      </div>
      <DefinitionList items={[
        ['版本', s.version ? <>{s.version}{s.version_matches === false && <Tag tone="muted">与 Dashboard 不一致</Tag>}</> : null],
        ['进程', s.pid ? <span className="mono">PID {s.pid}</span> : null],
        ['接受新请求', c.accepting == null ? null : c.accepting ? '是' : '否'],
        ['快照时间', `${shortTime(snapshot.checked_at)} · ${relative(snapshot.checked_at)}`],
      ]} />
    </section>

    <div className="monitor-grid">
      <article className="gauge-card">
        <Ring value={c.active} max={c.max_active} label={`正在执行 ${number(c.active)} / ${number(c.max_active)}`} tone="accent">
          <strong>{c.active == null ? '—' : c.active}</strong></Ring>
        <div><h3>正在执行</h3><p className="gauge-value">{number(c.active)}<span> / {number(c.max_active)}</span></p><small>健康接口报告的全局并发</small></div>
      </article>
      <article className="gauge-card">
        <Ring value={c.queued} max={c.max_queued} label={`等待队列 ${number(c.queued)} / ${number(c.max_queued)}`} tone={c.queued && c.max_queued && c.queued / c.max_queued > 0.7 ? 'warn' : 'accent'}>
          <strong>{c.queued == null ? '—' : c.queued}</strong></Ring>
        <div><h3>等待队列</h3><p className="gauge-value">{number(c.queued)}<span> / {number(c.max_queued)}</span></p><small>配置上限不等于实时可用容量</small></div>
      </article>
      <article className="gauge-card">
        <Ring value={st.pending_records} max={maxPending} label={`待落账记录 ${number(st.pending_records)}`} tone={st.degraded ? 'bad' : 'good'}>
          <strong>{st.pending_records == null ? '—' : st.pending_records}</strong></Ring>
        <div><h3>待落账记录</h3><p className="gauge-value">{number(st.pending_records)}{maxPending != null && <span> / {number(maxPending)}</span>}</p>
          <small>{st.degraded == null ? '存储状态未知' : st.degraded ? '存储降级' : '存储正常'} · 无效记录 {number(st.invalid_records)}</small></div>
      </article>
      <article className="gauge-card">
        <span className="gauge-icon"><Icon name="bolt" size={20} /></span>
        <div><h3>本轮准入</h3><p className="gauge-value">{number(c.admitted)}</p><small>{st.accepting == null ? '落账接收状态未知' : st.accepting ? '账本正在接收记录' : '账本暂停接收'}</small></div>
      </article>
    </div>

    <div className="grid-2">
      <Panel title="运行日志" icon="terminal" subtitle={logs ? `最近 ${logs.window} 行窗口 · 仅结构化安全字段` : '日志窗口'}
        actions={<Tag tone="muted">不受用量筛选影响</Tag>}>
        {!logs ? <Empty icon="alert" tone="error" title="日志暂不可读">{failures.logs ?? '请检查日志权限与路径。'}</Empty>
          : !logs.items.length ? <Empty icon="terminal" title="暂无结构化日志">网关记录请求后，会出现在这里。</Empty>
          : <ol className="log-list">{logs.items.map((e, i) => <li key={`${e.timestamp}-${i}`}>
            <time dateTime={e.timestamp} title={dateTime(e.timestamp)}>{shortTime(e.timestamp)}</time>
            <span className="mono log-path">{e.path}</span>
            <Pill tone={e.status == null ? 'unknown' : e.status >= 500 ? 'bad' : e.status >= 400 ? 'warn' : 'good'} dot={false}>{e.status == null ? '未知' : e.status}</Pill>
            <span className="log-meta">{duration(e.duration_ms, '—')}{e.queue_ms ? ` · 排队 ${duration(e.queue_ms)}` : ''}{e.upstream_attempts != null ? ` · ${e.upstream_attempts} 次尝试` : ''}</span>
          </li>)}</ol>}
        {logs && <p className="panel-foot">窗口内省略 {number(logs.omitted)} 行非结构化日志；原始异常文本不会转发到页面。</p>}
      </Panel>
      <Panel title="本地备份" icon="archive" subtitle={backups ? `最近 ${backups.limit} 份 · 共 ${number(backups.total)} 份可识别备份` : '备份清单'}
        actions={<Tag tone="muted">完整性未检查</Tag>}>
        {!backups ? <Empty icon="alert" tone="error" title="备份目录暂不可读">{failures.backups ?? '请检查备份目录权限。'}</Empty>
          : !backups.items.length ? <Empty icon="archive" title="尚无备份记录">此处只列出已有备份，不会执行备份或恢复。</Empty>
          : <ol className="backup-list">{backups.items.map(b => <li key={b.name}>
            <span className="backup-icon"><Icon name="archive" size={15} /></span>
            <div><strong>{b.created_at ? dateTime(b.created_at) : <Unknown>创建时间未知</Unknown>}</strong><span className="mono">{b.name}</span></div>
            <Tag tone={b.manifest === 'sha256_present' ? undefined : 'muted'}>{label(b.manifest)}</Tag>
          </li>)}</ol>}
        <p className="panel-foot">存在清单不代表备份健康；请在终端使用 backup verify 校验。</p>
      </Panel>
    </div>

    {snapshot.limits && Object.keys(snapshot.limits).length > 0 && <Panel title="本地运行限制" icon="gauge" subtitle="来自当前配置，不是实时容量">
      <dl className="limits">{Object.entries(snapshot.limits).map(([key, value]) => {
        const [name, unit] = limitLabels[key] ?? [key, key.endsWith('_seconds') ? 'seconds' : 'count'];
        return <div key={key}><dt>{name}</dt><dd>{unit === 'seconds' ? duration(value * 1000) : number(value)}</dd></div>;
      })}</dl>
    </Panel>}
  </>;
}
