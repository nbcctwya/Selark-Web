import type { Application, Connection } from '../api/types';
import type { Tone } from './format';

export function authorizationText(c: Connection): { text: string; tone: Tone } {
  const a = c.authorization;
  if (a.state === 'unreadable') return { text: '本地状态不可读', tone: 'bad' };
  if (a.kind === 'oauth') {
    if (a.access_expired) return { text: '已到期，待刷新', tone: 'warn' };
    if (a.ready) return { text: '本地授权就绪', tone: 'good' };
    return { text: '尚未授权 / 未就绪', tone: 'warn' };
  }
  if (a.credential_configured === false) return { text: '未配置 Key', tone: 'warn' };
  return { text: '已配置 Key', tone: 'neutral' };
}

export function availabilityText(c: Connection): { text: string; tone: Tone } {
  if (!c.enabled) return { text: '连接已停用', tone: 'neutral' };
  if (c.availability.state === 'blocked_locally') return { text: '本地受阻', tone: 'warn' };
  return { text: c.availability.checked_live ? '已实时检查' : '实时可用性未知', tone: 'unknown' };
}

/** Headline for a connection card; never claims live availability. */
export function connectionHeadline(c: Connection): { text: string; tone: Tone } {
  if (!c.enabled) return { text: '已停用', tone: 'neutral' };
  if (c.availability.state === 'blocked_locally') return { text: '本地受阻', tone: 'warn' };
  if (c.verification.state === 'success') return { text: '历史验证通过', tone: 'good' };
  if (c.verification.state === 'stale') return { text: '配置已变化', tone: 'warn' };
  if (c.verification.state === 'failed' || c.verification.state === 'failure') return { text: '历史验证失败', tone: 'bad' };
  return { text: '尚未验证', tone: 'unknown' };
}

export function quotaHeadline(a: Application): { text: string; tone: Tone } {
  switch (a.quota.token_quota_state) {
    case 'unlimited': return { text: '未设日上限', tone: 'neutral' };
    case 'limited': return { text: '有日限额', tone: 'good' };
    case 'exhausted': return { text: '今日已耗尽', tone: 'bad' };
    case 'blocked_unknown_usage': return { text: '未知用量 · 已暂停', tone: 'warn' };
    default: return { text: a.quota.token_quota_state, tone: 'unknown' };
  }
}

export const allowList = (value: string[] | null, any = '未限定列表', none = '空列表 · 全部拒绝') =>
  value == null ? any : value.length ? value.join('、') : none;

export const discoveryText: Record<string, string> = { never: '尚未查询', success: '目录已获取', failure: '最近发现失败', stale: '来源已变更' };

export const limitLabels: Record<string, [string, 'count' | 'seconds']> = {
  max_concurrent_requests: ['全局并发上限', 'count'],
  max_queued_requests: ['等待队列上限', 'count'],
  max_pending_records: ['待落账记录上限', 'count'],
  queue_timeout_seconds: ['排队超时', 'seconds'],
  request_timeout_seconds: ['请求超时', 'seconds'],
  body_timeout_seconds: ['请求体读取超时', 'seconds'],
  connect_timeout_seconds: ['连接超时', 'seconds'],
  pool_timeout_seconds: ['连接池等待', 'seconds'],
  write_timeout_seconds: ['写入超时', 'seconds'],
  send_timeout_seconds: ['发送超时', 'seconds'],
  shutdown_grace_seconds: ['停机宽限', 'seconds'],
  storage_busy_timeout_seconds: ['存储忙等待', 'seconds'],
};
