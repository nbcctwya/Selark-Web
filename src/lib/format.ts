/**
 * Display helpers. `null`/`undefined` always mean "unknown" and are never rendered as zero.
 * Monetary values stay decimal strings end to end; we only re-group and trim them.
 */
export const UNKNOWN = '未知';

const integer = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const compactFormat = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 });

export function number(value: number | null | undefined, fallback = UNKNOWN): string {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Number.isInteger(value) ? integer.format(value) : decimal.format(value);
}

/** Provider counters are decimal strings and can exceed JavaScript's safe integer range. */
export function counter(value: string | null | undefined, fallback = UNKNOWN): string {
  if (value == null || !/^\d{1,19}$/.test(value)) return fallback;
  return integer.format(BigInt(value));
}

export function compact(value: number | null | undefined, fallback = UNKNOWN): string {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.abs(value) < 10000 ? number(value) : compactFormat.format(value);
}

export function percent(value: number | null | undefined, digits = 1, fallback = UNKNOWN): string {
  if (value == null || !Number.isFinite(value)) return fallback;
  return `${(value * 100).toFixed(digits)}%`;
}

export function duration(ms: number | null | undefined, fallback = UNKNOWN): string {
  if (ms == null || !Number.isFinite(ms)) return fallback;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
  const minutes = Math.floor(ms / 60000);
  return `${minutes} 分 ${Math.round((ms % 60000) / 1000)} 秒`;
}

/** Re-groups a decimal string without passing through floating point. Keeps 2–9 fraction digits. */
export function decimalString(value: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return value;
  const [, sign, whole, fraction = ''] = match;
  let digits = fraction.slice(0, 9).replace(/0+$/, '');
  if (digits.length < 2) digits = digits.padEnd(2, '0');
  const grouped = whole.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${grouped}.${digits}`;
}

export function moneyEntries(amounts: Record<string, string> | null | undefined): [string, string][] {
  return Object.entries(amounts ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([currency, amount]) => [currency, decimalString(amount)]);
}

/** Each currency is shown on its own; there is no conversion or sum across currencies. */
export function money(amounts: Record<string, string> | null | undefined, fallback = '未知 / 未定价'): string {
  const entries = moneyEntries(amounts);
  return entries.length ? entries.map(([currency, amount]) => `${currency} ${amount}`).join(' · ') : fallback;
}

export function dateTime(value: string | null | undefined, fallback = '尚无记录'): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return fallback;
  return date.toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function shortTime(value: string | null | undefined, fallback = '—'): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return fallback;
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })
    : date.toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function relative(value: string | null | undefined, now = Date.now(), fallback = '尚无记录'): string {
  if (!value) return fallback;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return fallback;
  const seconds = Math.round((now - time) / 1000);
  if (seconds < 0) return '刚刚';
  if (seconds < 45) return '刚刚';
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} 分钟前`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} 小时前`;
  if (seconds < 86400 * 45) return `${Math.round(seconds / 86400)} 天前`;
  return dateTime(value);
}

export const utcDay = (day: string) => day.slice(5).replace('-', '/');

const labels: Record<string, string> = {
  api: 'API', token_plan: 'Token Plan',
  success: '成功', failed: '失败', failure: '失败', cancelled: '已取消', interrupted: '已中断', running: '运行中', unknown: '未知', pending: '待完成',
  unlimited: '未设上限', limited: '有限额', exhausted: '已耗尽', blocked_unknown_usage: '未知用量 · 已暂停',
  never: '尚未验证', stale: '配置已变化', not_checked: '未检查', not_configured: '未配置', unreadable: '不可读',
  unreachable_or_invalid: '离线或响应无效', degraded: '运行异常', sent: '已发送', reported: '历史已报告',
  connected: '已授权', not_connected: '未授权', disconnected: '未授权', new: '新建', ready: '就绪',
  estimated: '估算', not_priced: '未定价', inconsistent: '计数矛盾', regressed: '计数回退', uncontradicted: '未发现矛盾',
  listed: '目录中', not_in_catalog: '目录中已缺失', missing: '目录中已缺失', unlisted: '目录中已缺失', manual: '手动添加', disabled: '已停用',
  blocked_locally: '本地受阻', allowed: '历史可访问', denied: '历史被拒绝',
  api_key: 'API Key', live: '实时', chat: '对话',
  reported_total: '供应商报告总量', unknown_hold: '未知 · 保守预留',
  text_nonstream: '文本 · 普通', text_stream: '文本 · 流式',
  'chat-completions': 'Chat Completions', responses: 'Responses', 'anthropic-messages': 'Anthropic Messages',
  sha256_present: '含 SHA-256 清单', legacy: '旧格式清单',
};
export const label = (value: string | null | undefined) => (value ? labels[value] ?? value : UNKNOWN);

export const blockerLabels: Record<string, string> = {
  connection_disabled: '连接已停用', models_not_configured: '尚未启用模型',
  plan_preset_only: '仅预设，不支持生成', local_state_unavailable: '本地状态不可读',
};

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'neutral' | 'unknown';
export function tone(value: string | null | undefined): Tone {
  if (!value) return 'unknown';
  if (['success', 'running', 'connected', 'sent', 'ready', 'allowed', 'uncontradicted'].includes(value)) return 'good';
  if (['failed', 'failure', 'degraded', 'unreadable', 'denied', 'exhausted', 'unreachable_or_invalid'].includes(value)) return 'bad';
  if (['stale', 'cancelled', 'interrupted', 'blocked_unknown_usage', 'blocked_locally', 'inconsistent', 'regressed', 'pending'].includes(value)) return 'warn';
  if (['unknown', 'never', 'not_checked', 'not_priced'].includes(value)) return 'unknown';
  return 'neutral';
}

export function initials(text: string) {
  const clean = text.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (!clean) return '?';
  const parts = clean.split(' ');
  if (/[一-鿿]/.test(parts[0][0])) return parts[0].slice(0, 1);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : clean.slice(0, 2)).toUpperCase();
}

/** Stable hue index for avatars; follows the entity id, never its rank. */
export function hueIndex(id: string, size = 6) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % size;
}
