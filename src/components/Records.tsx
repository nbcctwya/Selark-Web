import { useMemo, useState } from 'react';
import type { Application, RecordsPage, RequestRecord, Snapshot } from '../api/types';
import { dateTime, decimalString, duration, label, number, shortTime } from '../lib/format';
import { Icon } from './Icon';
import { Sheet } from './Overlay';
import { Button, DefinitionList, Empty, Panel, Pill, Segmented, StatusPill, Tag, Unknown } from './ui';

const appName = (apps: Application[], id: string | null) => (id ? apps.find(a => a.id === id)?.name ?? id : null);

function TokenCell({ row }: { row: RequestRecord }) {
  if (row.total_tokens == null) return <Unknown>{row.upstream_attempts === 0 ? '未发送' : '未知'}</Unknown>;
  return <>{number(row.total_tokens)}{!row.usage_known && <span className="cell-sub">不完整</span>}</>;
}
function CostCell({ row }: { row: RequestRecord }) {
  if (row.cost.estimated_cost == null || !row.cost.currency) return <Unknown>{row.cost.cost_status === 'not_priced' ? '未定价' : '未知'}</Unknown>;
  return <span className="mono-num">{row.cost.currency} {decimalString(row.cost.estimated_cost)}</span>;
}

export function RecordsPanel({ snapshot, records, failure, loading, errorsOnly, onErrors, onOffset, compact = false, onSeeAll, title }: {
  snapshot: Snapshot; records: RecordsPage | null; failure: string | null; loading: boolean; errorsOnly: boolean;
  onErrors: (value: boolean) => void; onOffset: (value: number) => void; compact?: boolean; onSeeAll?: () => void; title?: string;
}) {
  const [detail, setDetail] = useState<RequestRecord | null>(null);
  const applicationNames = useMemo(() => new Map(snapshot.applications.map(app => [app.id, app.name])), [snapshot.applications]);
  const items = compact ? records?.items.slice(0, 6) ?? [] : records?.items ?? [];
  const page = records ? Math.floor(records.offset / records.limit) + 1 : 1;
  const pages = records ? Math.max(1, Math.ceil(records.total / records.limit)) : 1;
  return <Panel className={`records${loading ? ' is-loading' : ''}`} icon="calls"
    title={<>{title ?? (errorsOnly ? '异常调用' : compact ? '最近调用' : '调用记录')}{records && <span className="count">{number(records.total)}</span>}</>}
    subtitle="当前筛选窗口 · 本地时间显示 · 仅元数据，不含请求内容"
    actions={<>
      <Segmented label="记录范围" size="sm" value={errorsOnly ? 'errors' : 'all'} onChange={v => onErrors(v === 'errors')}
        options={[{ value: 'all', label: '全部' }, { value: 'errors', label: '仅异常' }]} />
      {onSeeAll && <Button size="sm" variant="ghost" onClick={onSeeAll}>查看全部<Icon name="arrowRight" size={14} /></Button>}
    </>}>
    {!records ? <Empty icon="alert" tone="error" title="调用记录暂不可读">{failure ?? '请稍后刷新重试。'}</Empty>
      : records.total === 0 ? <Empty icon="calls" title={errorsOnly ? '这个时段没有异常调用' : '这个时段还没有调用记录'}>{errorsOnly ? '所选窗口内没有失败、取消或中断的调用。' : '应用通过 Selark 发起调用后，记录会出现在这里。'}</Empty>
      : <>
        <div className="table-wrap"><table className="table records-table">
          <caption className="sr-only">调用记录，第 {page} 页，共 {pages} 页</caption>
          <thead><tr><th scope="col">时间</th><th scope="col">模型 / 连接</th><th scope="col">应用</th><th scope="col">最终状态</th><th scope="col" className="num">Token</th><th scope="col" className="num">费用估算</th><th scope="col" className="num">耗时</th><th scope="col"><span className="sr-only">详情</span></th></tr></thead>
          <tbody>{items.map(row => <tr key={row.request_id} className="clickable" onClick={() => setDetail(row)}>
            <td data-label="时间"><time dateTime={row.started_at ?? undefined} title={dateTime(row.started_at)}>{shortTime(row.started_at)}</time></td>
            <td data-label="模型"><span className="mono strong">{row.model ?? '未知模型'}</span><span className="cell-sub">{row.connection_id ?? '未知连接'}</span></td>
            <td data-label="应用">{row.caller_id ? applicationNames.get(row.caller_id) ?? row.caller_id : <Unknown>未知应用</Unknown>}</td>
            <td data-label="状态"><StatusPill value={row.status} text={label(row.status)} />{row.error_code && <span className="cell-sub mono">{row.error_code}</span>}</td>
            <td data-label="Token" className="num"><TokenCell row={row} /></td>
            <td data-label="费用" className="num"><CostCell row={row} /></td>
            <td data-label="耗时" className="num">{duration(row.duration_ms)}</td>
            <td className="row-action"><button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`查看 ${row.request_id} 详情`} onClick={event => { event.stopPropagation(); setDetail(row); }}><Icon name="chevronRight" size={16} /></button></td>
          </tr>)}</tbody>
        </table></div>
        {!compact && <nav className="pager" aria-label="调用记录分页">
          <span className="pager-info" aria-live="polite">{records.offset + 1}–{Math.min(records.offset + records.limit, records.total)} / {number(records.total)}</span>
          <span className="pager-page">第 {page} / {pages} 页</span>
          <Button size="sm" icon="chevronLeft" disabled={records.offset === 0 || loading} onClick={() => onOffset(Math.max(0, records.offset - records.limit))}>上一页</Button>
          <Button size="sm" disabled={records.offset + records.limit >= records.total || loading} onClick={() => onOffset(records.offset + records.limit)}>下一页<Icon name="chevronRight" size={15} /></Button>
        </nav>}
      </>}
    <RecordDetail record={detail} snapshot={snapshot} onClose={() => setDetail(null)} />
  </Panel>;
}

function RecordDetail({ record: r, snapshot, onClose }: { record: RequestRecord | null; snapshot: Snapshot; onClose: () => void }) {
  return <Sheet open={Boolean(r)} onClose={onClose} labelId="record-title" eyebrow="调用详情" title={r?.model ?? '未知模型'}
    subtitle={r && <span className="mono">{r.request_id}</span>}>
    {r && <>
      <div className="state-grid" aria-label="四个独立状态">
        <div><span>最终状态</span><StatusPill value={r.status} text={label(r.status)} /></div>
        <div><span>上游结果</span><StatusPill value={r.upstream_result} text={label(r.upstream_result)} /></div>
        <div><span>下游交付</span><StatusPill value={r.delivery_status} text={label(r.delivery_status)} /></div>
        <div><span>用量完整性</span><Pill tone={r.usage_known ? 'good' : 'unknown'}>{r.usage_known ? (r.usage_final ? '已知 · 最终' : '已知 · 未最终') : '未知'}</Pill></div>
      </div>
      <section className="detail-section"><h3>路由</h3><DefinitionList items={[
        ['应用', appName(snapshot.applications, r.caller_id)], ['连接', r.connection_id && <span className="mono">{r.connection_id}</span>],
        ['资源类型', r.resource_type && label(r.resource_type)], ['用途 / 来源', `${label(r.purpose)} · ${label(r.origin)}`],
        ['HTTP 状态', r.http_status], ['上游 HTTP 状态', r.upstream_status],
        ['已记录上游尝试', r.upstream_attempts], ['错误代码', [r.error_code, r.upstream_error_code, r.delivery_error_code].some(Boolean)
          ? <span className="mono">{[['本地', r.error_code], ['上游', r.upstream_error_code], ['交付', r.delivery_error_code]].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ')}</span> : '无'],
      ]} /></section>
      <section className="detail-section"><h3>时间</h3><DefinitionList items={[
        ['开始', dateTime(r.started_at, '未知')], ['结束', dateTime(r.finished_at, '未知')],
        ['端到端耗时', duration(r.duration_ms)], ['排队耗时', duration(r.queue_ms)],
      ]} /><p className="note">端到端耗时包含排队与下游传输，不是首 Token 延迟。</p></section>
      <section className="detail-section"><h3>用量</h3><DefinitionList items={[
        ['输入 Token', number(r.prompt_tokens)], ['输出 Token', number(r.completion_tokens)], ['总 Token', number(r.total_tokens)],
        ['用量一致性', label(r.usage_consistency)], ['配额核算口径', r.cost.token_basis ? label(r.cost.token_basis) : null],
      ]} /></section>
      <section className="detail-section"><h3>费用</h3><DefinitionList items={[
        ['费用估算', r.cost.estimated_cost == null || !r.cost.currency ? <Unknown>未知 / 未定价</Unknown> : <span className="mono-num">{r.cost.currency} {decimalString(r.cost.estimated_cost)}</span>],
        ['费用口径', r.cost.cost_status ? label(r.cost.cost_status) : null],
      ]} /><p className="note">费用按调用时保存的价格快照估算，不是供应商账单；Token Plan 与订阅不换算为按量费用。</p></section>
      <p className="sheet-hint"><Tag tone="muted">只读</Tag>此处仅展示调用元数据，不包含提示词或回复内容。</p>
    </>}
  </Sheet>;
}
