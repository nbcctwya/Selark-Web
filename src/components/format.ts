export const number = (value: number | null | undefined) => value == null ? '未知' : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);
export const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '尚无记录';
export const money = (amounts: Record<string, string>) => Object.entries(amounts).map(([currency, amount]) => `${currency} ${amount}`).join(' / ') || '未知 / 未定价';
const labels: Record<string, string> = { success: '成功', failed: '失败', cancelled: '已取消', interrupted: '已中断', running: '运行中', unknown: '未知', api: 'API', token_plan: 'Token Plan', chatgpt_subscription: 'ChatGPT 订阅', unlimited: '未设上限', limited: '有限额', exhausted: '已耗尽', blocked_unknown_usage: '未知用量，已暂停', never: '尚未验证', stale: '配置已变化', unreachable_or_invalid: '离线或响应无效', not_checked: '未检查', degraded: '异常', sent: '已发送' };
export const label = (value: string | null | undefined) => value ? labels[value] ?? value : '未知';
