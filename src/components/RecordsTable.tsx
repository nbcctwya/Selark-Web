import { useEffect, useRef, useState } from 'react';
import type { Application, RecordsPage, RequestRecord } from '../api/types';
import { date, label, number } from './format';

export function RecordsTable({ records, applications, errorsOnly, onErrors, onOffset }: { records: RecordsPage | null; applications: Application[]; errorsOnly: boolean; onErrors: (value: boolean) => void; onOffset: (value: number) => void }) {
  const [detail, setDetail] = useState<RequestRecord | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (detail) dialog.current?.showModal(); }, [detail]);
  return <section className="panel">
    <div className="section-heading"><h2>调用记录</h2><label className="check"><input type="checkbox" checked={errorsOnly} onChange={e => onErrors(e.target.checked)} />仅看异常</label></div>
    {!records ? <p className="empty">调用记录暂不可读。</p> : <>
      <div className="table-scroll"><table><thead><tr><th>时间</th><th>应用 / 连接</th><th>模型</th><th>状态</th><th>Token</th><th>耗时</th><th>操作</th></tr></thead>
        <tbody>{records.items.map(row => <tr key={row.request_id}>
          <td>{date(row.started_at)}</td><td>{applications.find(a => a.id === row.caller_id)?.name ?? row.caller_id}<small>{row.connection_id}</small></td>
          <td>{row.model ?? '未知'}</td><td><span className={`badge ${row.status}`}>{label(row.status)}</span></td><td>{number(row.total_tokens)}</td><td>{number(row.duration_ms)} ms</td>
          <td><button className="secondary" onClick={() => setDetail(row)}>详情</button></td>
        </tr>)}</tbody></table></div>
      {records.total === 0 && <p className="empty">这个时段还没有调用记录。</p>}
      <div className="pagination"><span>{records.total ? `${records.offset + 1}–${Math.min(records.offset + records.limit, records.total)}` : '0'} / {records.total}</span>
        <button className="secondary" disabled={records.offset === 0} onClick={() => onOffset(Math.max(0, records.offset - records.limit))}>上一页</button>
        <button className="secondary" disabled={records.offset + records.limit >= records.total} onClick={() => onOffset(records.offset + records.limit)}>下一页</button>
      </div>
    </>}
    <dialog ref={dialog} onClose={() => setDetail(null)} aria-labelledby="record-title">
      {detail && <><div className="section-heading"><h2 id="record-title">调用详情</h2><button onClick={() => dialog.current?.close()}>关闭</button></div>
        <dl>{Object.entries({ '请求 ID': detail.request_id, '模型': detail.model, '最终状态': label(detail.status), '上游结果': label(detail.upstream_result), '下游交付': label(detail.delivery_status), '开始时间': date(detail.started_at), '结束时间': date(detail.finished_at), '输入 Token': number(detail.prompt_tokens), '输出 Token': number(detail.completion_tokens), '总 Token': number(detail.total_tokens), '排队耗时': `${number(detail.queue_ms)} ms`, '费用估算': detail.cost.estimated_cost == null ? '未知' : `${detail.cost.currency} ${detail.cost.estimated_cost}`, '错误代码': [detail.error_code, detail.upstream_error_code, detail.delivery_error_code].filter(Boolean).join(' / ') || '无' }).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value ?? '未知'}</dd></div>)}</dl>
        <p className="muted">费用是估算值。此处仅展示调用元数据。</p></>}
    </dialog>
  </section>;
}
