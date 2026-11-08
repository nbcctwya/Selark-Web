import type { Connection } from '../api/types';

export const levels = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = typeof levels[number];
export type Efforts = Partial<Record<Effort, string>>;
export type Protocol = 'openai-completions' | 'openai-responses' | 'anthropic-messages';
export type AgentConnection = Pick<Connection, 'id' | 'provider' | 'resource_type'>;
export interface AgentDraft { protocol: Protocol; mode: 'preset' | 'custom' | 'default'; efforts: Efforts; defaultEffort: Effort | '' }
export interface Preset { efforts: Efforts | null; note: string; fixed?: boolean; adaptive?: boolean; unavailable?: boolean; control?: 'switch' | 'budget'; alwaysThinking?: boolean }
const identity = (...items: Effort[]): Efforts => Object.fromEntries(items.map(item => [item, item]));
const five = () => identity('low', 'medium', 'high', 'xhigh', 'max');
export const protocolNames: Record<Protocol, string> = {
  'openai-completions': 'Chat Completions', 'openai-responses': 'Responses', 'anthropic-messages': 'Messages',
};

// Match the gateway's native protocol routes.
export function protocolsFor(c: AgentConnection): Protocol[] {
  if (c.provider === 'anthropic') return ['anthropic-messages'];
  if (c.provider === 'openai') return ['openai-responses', 'openai-completions'];
  if (c.provider === 'zhipu' || c.provider === 'glm-coding') return ['openai-completions'];
  if (['kimi-code', 'kimi', 'mimo'].includes(c.provider)) return ['openai-completions', 'openai-responses', 'anthropic-messages'];
  return ['openai-responses', 'openai-completions', 'anthropic-messages'];
}

// Exact documented families, checked 2026-11-07. Unknown IDs and relays require an explicit declaration.
// Sources and update rules: backend/docs/guides/reasoning-effort.md.
export function presetFor(c: AgentConnection, model: string): Preset {
  if (c.provider === 'kimi-code') {
    if (model === 'kimi-for-coding-highspeed') return { efforts: {}, fixed: true, note: '此高速模型始终开启思考，不支持调整档位。' };
    if (['kimi-for-coding', 'k3', 'k3-256k', 'k3.1-pro', 'k3.1-pro-highspeed'].includes(model)) {
      return { efforts: identity('low', 'high', 'max'), adaptive: true,
        note: '此 Kimi 模型支持 low / high / max 三档。兼容别名不作为额外档位显示或导出。' };
    }
  }
  if (c.provider === 'kimi') {
    if (['kimi-k3', 'kimi-k3.1-pro', 'kimi-k3.1-pro-highspeed'].includes(model)) {
      return { efforts: identity('low', 'high', 'max'), alwaysThinking: true,
        note: '此 Kimi API 模型支持 low / high / max 三档，始终开启思考。使用 Chat Completions 的 reasoning_effort。' };
    }
    if (['kimi-k2.7-code', 'kimi-k2.7-code-highspeed'].includes(model)) {
      return { efforts: {}, fixed: true, note: '此 Kimi 模型始终开启思考，不支持 reasoning_effort；不能使用 K3 的三档配置。' };
    }
    if (model === 'kimi-k2.6') return { efforts: {}, control: 'switch', note: 'Kimi K2.6 支持开启或关闭思考，不支持 reasoning_effort 档位。通过 thinking.type 控制。' };
  }
  if (c.provider === 'mimo' && ['mimo-v2.6-flash', 'mimo-v2.6-pro', 'mimo-v2.6-pro-ultraspeed'].includes(model)) {
    return { efforts: {}, control: 'switch', note: '此 MiMo 模型支持开启或关闭思考，通过 thinking.type 控制；官方未声明 low / high / max 档位。' };
  }
  if (['zhipu', 'glm-coding'].includes(c.provider)) {
    const glm = model.toLowerCase();
    if (['glm-5.3', 'glm-5.3-flash', 'glm-5.3-flashx'].includes(glm)) {
      return { efforts: identity('low', 'high', 'max'), alwaysThinking: true,
        note: '此 GLM 5.3 模型支持 low / high / max 三档。套餐兼容别名不计为额外档位。' };
    }
    if (glm === 'glm-5.2') return { efforts: identity('high', 'max'), note: 'GLM 5.2 有 high / max 两档推理；low / medium 等同 high，xhigh 等同 max。关闭思考不计为一档强度。' };
    if (['glm-5.1', 'glm-5', 'glm-5-turbo', 'glm-5v-turbo', 'glm-4.7', 'glm-4.6', 'glm-4.5', 'glm-4.5-air'].includes(glm)) {
      return { efforts: {}, control: 'switch', note: '此 GLM 型号通过 thinking.type 开启或关闭思考，不支持 GLM 5.2 / 5.3 的 reasoning_effort 档位。' };
    }
  }
  const id = model.replace(/-\d{4}-\d{2}-\d{2}$/, '');
  if (c.provider === 'openai') {
    if (['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-6-sol', 'gpt-6-luna'].includes(id)) {
      return { efforts: five(), note: '此 GPT 模型支持 low / medium / high / xhigh / max 五档推理。工具调用使用 Responses；模型权限由账户决定。' };
    }
    // Match individual models, not every GPT model to the newest family's capabilities.
    if (id === 'gpt-5.1') return { efforts: identity('low', 'medium', 'high'), note: 'GPT-5.1 支持 low / medium / high 三档推理，没有 xhigh 或 max。' };
    if (id === 'gpt-5.2') return { efforts: identity('low', 'medium', 'high', 'xhigh'), note: 'GPT-5.2 支持 low / medium / high / xhigh 四档推理，没有 max。' };
    if (['gpt-image-2.5-sunburst', 'gpt-image-2.5-flare', 'gpt-image-2.6-sunburst', 'gpt-image-2.6-flare'].includes(id)) {
      return { efforts: {}, fixed: true, unavailable: true, note: '这是图片生成模型，文字编程助手的推理档位不适用。此页面不生成它的 DSH 对话配置。' };
    }
  }
  if (c.provider === 'deepseek' && ['deepseek-flash', 'deepseek-v4-pro'].includes(id)) {
    return { efforts: identity('low', 'high', 'max'), adaptive: true, note: 'DeepSeek 提供 low / high / max 三档；优先使用 Responses。' };
  }
  const claude = model.replace(/-\d{8}$/, '');
  if (c.provider === 'anthropic') {
    if (['claude-sonnet-4-5', 'claude-haiku-4-5'].includes(claude)) {
      return { efforts: {}, control: 'budget', note: '此 Claude 模型使用 thinking.budget_tokens 控制思考预算，不支持 output_config.effort。预算数不等同于固定推理档位。' };
    }
    if (['claude-opus-4-6', 'claude-sonnet-4-6'].includes(claude)) return { efforts: identity('low', 'medium', 'high', 'max'), adaptive: true, note: '此 Claude 模型支持 low / medium / high / max；使用 Messages 的 effort 与自适应思考。' };
    if (['claude-opus-4-7', 'claude-opus-4-8', 'claude-opus-5', 'claude-opus-5-5', 'claude-sonnet-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5', 'claude-fable-5-1', 'claude-mythos-5', 'claude-mythos-5-1'].includes(claude)) {
      return { efforts: five(), adaptive: true, note: '此 Claude 模型支持五档 effort；通过原生 Messages 保留思考块与工具调用。' };
    }
  }
  return { efforts: null, note: '尚未识别此模型的推理档位。可使用服务默认值，或按供应商说明手动配置。' };
}

export function reasoningLabel(preset: Preset): string {
  if (preset.unavailable) return '图片模型 · 档位不适用';
  if (preset.fixed) return '固定思考 · 不可调档';
  if (preset.control === 'switch') return '思考开关 · 无强度档位';
  if (preset.control === 'budget') return '思考预算 · 按 Token 设置';
  if (preset.efforts === null) return '推理档位待确认';
  return `已识别 ${Object.keys(preset.efforts).length} 档推理`;
}

export function initialDraft(c: AgentConnection, model: string): AgentDraft {
  const preset = presetFor(c, model);
  return { protocol: protocolsFor(c)[0], mode: preset.efforts === null ? 'default' : 'preset', efforts: { ...preset.efforts }, defaultEffort: '' };
}

export function effectiveEfforts(c: AgentConnection, model: string, draft: AgentDraft): Efforts {
  return draft.mode === 'default' ? {} : draft.mode === 'preset' ? presetFor(c, model).efforts ?? {} : draft.efforts;
}

export function draftProblem(c: AgentConnection, model: string, draft: AgentDraft): string | null {
  if (c.provider === 'glm-coding') return '此套餐当前仅有配置预设，后端尚未开放真实生成。';
  if (presetFor(c, model).unavailable) return '请选择支持对话的模型。此图片模型不适用 DSH 对话接入。';
  if (!protocolsFor(c).includes(draft.protocol)) return '此连接不支持所选接入协议。';
  const preset = presetFor(c, model);
  if ((preset.fixed || preset.control) && draft.mode === 'custom') return '此模型不支持 effort 档位，请使用它实际支持的思考控制方式。';
  if (preset.control === 'switch' && draft.protocol !== 'openai-completions') return '此模型的思考开关已按 Chat Completions 核对，请选择该协议。';
  const efforts = effectiveEfforts(c, model, draft);
  if (draft.mode === 'custom' && !Object.keys(efforts).length) return '请至少启用一个档位，或选择「使用服务默认值」。';
  for (const value of Object.values(efforts)) {
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(value)) return '每个档位需要有效的供应商参数值（小写字母、数字、下划线或连字符）。';
    if (draft.protocol === 'openai-completions' && !['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(value)) return 'Chat Completions 暂不接受此档位值；请使用供应商原生协议或其支持的值。';
  }
  if (draft.defaultEffort && !efforts[draft.defaultEffort]) return '客户端默认档位必须在已启用的档位中。';
  return null;
}

export function gatewayUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) return null;
    if (!['', '/', '/v1', '/v1/'].includes(url.pathname)) return null;
    return `${url.origin}/v1`;
  } catch { return null; }
}

export function dshConfiguration(c: AgentConnection, model: string, baseURL: string, draft: AgentDraft): string {
  if (draftProblem(c, model, draft) || !gatewayUrl(baseURL)) return '';
  const efforts = effectiveEfforts(c, model, draft);
  const preset = presetFor(c, model);
  const compat: Record<string, string | boolean> = {};
  if (draft.protocol === 'openai-completions') {
    // ZAI's SDK format sends thinking:disabled with no selected effort. GLM 5.3 must
    // use the effort-only format so an omitted default never disables its thinking.
    Object.assign(compat, { thinkingFormat: c.provider === 'deepseek' ? 'deepseek' : c.provider === 'zhipu' && !preset.alwaysThinking ? 'zai' : 'openai', supportsStore: false, supportsReasoningEffort: Object.keys(efforts).length > 0 });
    if (['kimi-code', 'kimi', 'deepseek', 'zhipu', 'mimo'].includes(c.provider)) Object.assign(compat, { supportsDeveloperRole: false, requiresReasoningContentOnAssistantMessages: true, maxTokensField: c.provider === 'mimo' ? 'max_completion_tokens' : 'max_tokens' });
  } else if (draft.protocol === 'anthropic-messages' && Object.keys(efforts).length) {
    // DSH otherwise infers adaptive thinking from the qualified model ID, which includes the connection prefix.
    compat.forceAdaptiveThinking = true;
    compat.supportsTemperature = false;
  }
  return [
    '# 将 provider 合并到 cordis.patch.yml 的 llm-pi-ai 配置；保留其他模型与 providers。',
    '# SELARK_API_KEY 使用 Selark 应用令牌，不是上游 API Key。',
    '- id: llm-pi-ai', '  config:', '    providers:',
    `      ${JSON.stringify(`selark-${c.id}-${draft.protocol}`)}:`,
    `        api: ${draft.protocol}`, `        baseURL: ${JSON.stringify(draft.protocol === 'anthropic-messages' ? gatewayUrl(baseURL)!.replace(/\/v1$/, '') : gatewayUrl(baseURL))}`,
    '        apiKeyEnv: SELARK_API_KEY',
    ...(c.resource_type === 'token_plan' ? ['        headers:', '          X-Selark-Interaction: personal_coding'] : []),
    ...(draft.defaultEffort ? [`        reasoning: ${draft.defaultEffort}`] : []),
    ...(Object.keys(compat).length ? ['        compat:', ...Object.entries(compat).map(([key, value]) => `          ${key}: ${JSON.stringify(value)}`)] : []),
    '        models:', `          - id: ${JSON.stringify(`${c.id}::${model}`)}`,
    ...(Object.keys(efforts).length ? ['            reasoningEfforts:', ...levels.filter(level => efforts[level]).map(level => `              ${level}: ${JSON.stringify(efforts[level])}`)] : ['            reasoningEfforts: false']), '',
  ].join('\n');
}

export function requestExample(c: AgentConnection, model: string, draft: AgentDraft): string {
  const efforts = effectiveEfforts(c, model, draft);
  const preset = presetFor(c, model);
  const choice = draft.defaultEffort || levels.find(level => efforts[level]);
  const effort = choice ? efforts[choice] : undefined;
  const body: Record<string, unknown> = { model: `${c.id}::${model}`, stream: true };
  if (c.resource_type === 'token_plan') body.interaction = 'personal_coding';
  if (draft.protocol === 'openai-responses') {
    body.input = [{ role: 'user', content: '请检查这段代码。' }]; body.store = false;
    if (effort) body.reasoning = { effort };
  } else {
    body.messages = [{ role: 'user', content: '请检查这段代码。' }];
    if (draft.protocol === 'anthropic-messages') {
      body.max_tokens = 4096;
      if (effort) { body.thinking = { type: 'adaptive' }; body.output_config = { effort }; }
      else if (draft.mode === 'preset' && preset.control === 'budget') body.thinking = { type: 'enabled', budget_tokens: 1024 };
    } else {
      if (effort) body.reasoning_effort = effort;
      if (draft.mode === 'preset' && preset.control === 'switch') body.thinking = { type: 'enabled' };
    }
  }
  return JSON.stringify(body, null, 2);
}

type DraftStore = Pick<Storage, 'getItem' | 'setItem'>;
const storeKey = 'selark-agent-settings-v1';
const draftKey = (scope: string, c: AgentConnection, model: string) => JSON.stringify([scope, c.id, c.provider, c.resource_type, model]);
function savedEntries(storage: DraftStore): Record<string, unknown> {
  try { const raw = storage.getItem(storeKey); if (!raw || raw.length > 512_000) return {}; const data: unknown = JSON.parse(raw); return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {}; } catch { return {}; }
}
export function readAgentDraft(storage: DraftStore, scope: string, c: AgentConnection, model: string): AgentDraft {
  const fallback = initialDraft(c, model), item = savedEntries(storage)[draftKey(scope, c, model)] as Partial<AgentDraft> | null;
  if (!item || !protocolsFor(c).includes(item.protocol as Protocol) || !['preset', 'custom', 'default'].includes(item.mode ?? '') || !item.efforts || typeof item.efforts !== 'object' || Array.isArray(item.efforts)) return fallback;
  if (Object.entries(item.efforts).some(([key, value]) => !levels.includes(key as Effort) || typeof value !== 'string' || value.length > 32)) return fallback;
  if (item.defaultEffort !== '' && !levels.includes(item.defaultEffort as Effort)) return fallback;
  const draft: AgentDraft = { ...(item as AgentDraft), efforts: { ...item.efforts } };
  if (draft.mode === 'preset') {
    // Refresh automatic capabilities on upgrade. Preserve the effective saved Kimi default,
    // but remove the 0.5.2 alias menu entries rather than displaying five apparent tiers.
    draft.efforts = { ...presetFor(c, model).efforts };
    if (draft.defaultEffort && !draft.efforts[draft.defaultEffort]) {
      const previousAlias = c.provider === 'kimi-code' ? ({ medium: 'high', xhigh: 'max' } as Partial<Record<Effort, Effort>>)[draft.defaultEffort]
        : ['zhipu', 'glm-coding'].includes(c.provider) && model.toLowerCase() === 'glm-5.2' ? ({ low: 'high', medium: 'high', xhigh: 'max' } as Partial<Record<Effort, Effort>>)[draft.defaultEffort] : undefined;
      draft.defaultEffort = previousAlias && draft.efforts[previousAlias] ? previousAlias : '';
    }
  }
  return draftProblem(c, model, draft) ? fallback : { protocol: draft.protocol, mode: draft.mode, efforts: { ...draft.efforts }, defaultEffort: draft.defaultEffort };
}
export function saveAgentDraft(storage: DraftStore, scope: string, c: AgentConnection, model: string, draft: AgentDraft): void {
  if (draftProblem(c, model, draft)) throw new Error('Invalid agent configuration');
  const key = draftKey(scope, c, model), entries = savedEntries(storage);
  delete entries[key];
  const recent = Object.fromEntries(Object.entries(entries).slice(-199));
  // Explicit projection: never store URLs, headers, credentials or request content.
  recent[key] = { protocol: draft.protocol, mode: draft.mode, efforts: { ...draft.efforts }, defaultEffort: draft.defaultEffort };
  storage.setItem(storeKey, JSON.stringify(recent));
}
