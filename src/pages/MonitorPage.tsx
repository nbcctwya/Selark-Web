import type { Backups, Logs, Snapshot } from '../api/types';
import { date, label, number } from '../components/format';

export function MonitorPage({ snapshot, logs, backups }: { snapshot: Snapshot; logs: Logs | null; backups: Backups | null }) {
  const service = snapshot.service;
  return <>
    <section className="panel"><h2>网关状态：{label(service.state)}</h2><dl>
      <div><dt>正在执行</dt><dd>{number(service.capacity?.active)} / {number(service.capacity?.max_active)}</dd></div>
      <div><dt>等待队列</dt><dd>{number(service.capacity?.queued)} / {number(service.capacity?.max_queued)}</dd></div>
      <div><dt>待落账记录</dt><dd>{number(service.storage?.pending_records)}</dd></div>
    </dl><p className="muted">本机健康快照不证明供应商当前可用。</p></section>
    <div className="cards"><section className="panel"><h2>运行日志</h2>
      {logs?.items.map((log, index) => <p key={index}>{date(log.timestamp)} · {log.path} · HTTP {log.status ?? '未知'}</p>)}
      {!logs?.items.length && <p className="empty">{logs ? '暂无日志。' : '日志暂不可读。'}</p>}
    </section><section className="panel"><h2>本地备份</h2>
      {backups?.items.map(backup => <p key={backup.name}>{date(backup.created_at)}<small>完整性未检查 · {backup.manifest === 'sha256_present' ? '含 SHA-256 清单' : '其他清单状态'}</small></p>)}
      {!backups?.items.length && <p className="empty">{backups ? '暂无备份。' : '备份目录暂不可读。'}</p>}
    </section></div>
  </>;
}
