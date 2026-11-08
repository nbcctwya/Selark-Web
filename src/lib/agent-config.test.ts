import { describe, expect, it } from 'vitest';
import { dshConfiguration, draftProblem, initialDraft, presetFor, readAgentDraft, reasoningLabel, requestExample, saveAgentDraft } from './agent-config';
import type { AgentConnection, AgentDraft } from './agent-config';

const api: AgentConnection = { id: 'api', provider: 'openai', resource_type: 'api' };
const kimi: AgentConnection = { id: 'coding', provider: 'kimi-code', resource_type: 'token_plan' };
const origin = 'http://127.0.0.1:8788/v1';
const storage = () => {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
};

describe('client reasoning configuration', () => {
  it('keeps OpenAI API effort values and uses native Responses', () => {
    const c = api;
    const draft = { ...initialDraft(c, 'gpt-6-luna'), defaultEffort: 'xhigh' as const };
    const config = dshConfiguration(c, 'gpt-6-luna', origin, draft);
    expect(config).toContain('api: openai-responses');
    expect(config).toContain('xhigh: "xhigh"');
    expect(config).toContain('reasoning: xhigh');
    expect(config).not.toContain('X-Selark-Interaction');
    expect(JSON.parse(requestExample(c, 'gpt-6-luna', draft))).toMatchObject({ model: `${c.id}::gpt-6-luna`, store: false, reasoning: { effort: 'xhigh' } });
  });

  it.each(['kimi-for-coding', 'k3', 'k3-256k', 'k3.1-pro', 'k3.1-pro-highspeed'])('recognizes exactly three real Kimi tiers for %s', model => {
    const draft = { ...initialDraft(kimi, model), defaultEffort: 'max' as const };
    const config = dshConfiguration(kimi, model, origin, draft);
    expect(presetFor(kimi, model).efforts).toEqual({ low: 'low', high: 'high', max: 'max' });
    expect(config).not.toContain('medium:');
    expect(config).not.toContain('xhigh:');
    expect(config).toContain('max: "max"');
    expect(config).toContain('X-Selark-Interaction: personal_coding');
    expect(JSON.parse(requestExample(kimi, model, draft))).toMatchObject({ reasoning_effort: 'max', interaction: 'personal_coding' });
    expect(dshConfiguration(kimi, 'kimi-for-coding-highspeed', origin, initialDraft(kimi, 'kimi-for-coding-highspeed'))).toContain('reasoningEfforts: false');
    expect(draftProblem(kimi, 'kimi-for-coding-highspeed', { ...draft, mode: 'custom' })).toBeTruthy();
  });

  it.each([
    ['kimi', 'kimi-k3', ['low', 'high', 'max']],
    ['kimi', 'kimi-k3.1-pro', ['low', 'high', 'max']],
    ['kimi', 'kimi-k3.1-pro-highspeed', ['low', 'high', 'max']],
    ['zhipu', 'glm-5.2', ['high', 'max']],
    ['zhipu', 'glm-5.3', ['low', 'high', 'max']],
    ['zhipu', 'GLM-5.3-FLASH', ['low', 'high', 'max']],
    ['zhipu', 'glm-5.3-flashx', ['low', 'high', 'max']],
  ] as const)('exports only canonical %s / %s tiers through Chat', (provider, model, expected) => {
    const c: AgentConnection = { ...api, provider }, draft = { ...initialDraft(c, model), defaultEffort: 'max' as const };
    expect(Object.keys(presetFor(c, model).efforts!)).toEqual(expected);
    expect(draft.protocol).toBe('openai-completions');
    const config = dshConfiguration(c, model, origin, draft);
    expect(config).toContain('supportsReasoningEffort: true');
    expect(config).toContain('requiresReasoningContentOnAssistantMessages: true');
    expect(config).toContain('reasoning: max');
    expect(config).not.toContain('medium:');
    expect(config).not.toContain('xhigh:');
    expect(config).not.toContain('personal_coding');
    if (model.toLowerCase().startsWith('glm-5.3')) expect(config).toContain('thinkingFormat: "openai"');
    expect(JSON.parse(requestExample(c, model, draft))).toMatchObject({ reasoning_effort: 'max', model: `${c.id}::${model}` });
  });

  it.each([
    ['mimo', 'mimo-v2.6-flash'], ['mimo', 'mimo-v2.6-pro'], ['mimo', 'mimo-v2.6-pro-ultraspeed'],
    ['kimi', 'kimi-k2.6'], ['zhipu', 'glm-5.1'], ['zhipu', 'glm-5'], ['zhipu', 'glm-4.7'],
  ] as const)('recognizes %s / %s as a switch without inventing effort tiers', (provider, model) => {
    const c: AgentConnection = { ...api, provider }, draft = initialDraft(c, model);
    expect(reasoningLabel(presetFor(c, model))).toBe('思考开关 · 无强度档位');
    const config = dshConfiguration(c, model, origin, draft);
    expect(config).toContain('reasoningEfforts: false');
    expect(config).toContain('supportsReasoningEffort: false');
    expect(config).not.toContain('reasoning:');
    if (provider === 'mimo') expect(config).toContain('maxTokensField: "max_completion_tokens"');
    const body = JSON.parse(requestExample(c, model, draft));
    expect(body.thinking).toEqual({ type: 'enabled' });
    expect(body.reasoning_effort).toBeUndefined();
    expect(JSON.parse(requestExample(c, model, { ...draft, mode: 'default' })).thinking).toBeUndefined();
    expect(draftProblem(c, model, { ...draft, mode: 'custom', efforts: { max: 'max' } })).toBeTruthy();
    expect(draftProblem(c, model, { ...draft, protocol: 'openai-responses' })).toBeTruthy();
  });

  it.each(['claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'])('recognizes %s budget semantics without adaptive thinking or effort', model => {
    const c: AgentConnection = { ...api, provider: 'anthropic' }, draft = initialDraft(c, model);
    expect(reasoningLabel(presetFor(c, model))).toBe('思考预算 · 按 Token 设置');
    const config = dshConfiguration(c, model, origin, draft);
    expect(config).not.toContain('forceAdaptiveThinking');
    expect(config).toContain('reasoningEfforts: false');
    const body = JSON.parse(requestExample(c, model, draft));
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 1024 });
    expect(body.max_tokens).toBeGreaterThan(body.thinking.budget_tokens);
    expect(body.output_config).toBeUndefined();
  });

  it('keeps capabilities separate from backend route availability and unknown model aliases', () => {
    const coding: AgentConnection = { ...kimi, provider: 'glm-coding' };
    expect(Object.keys(presetFor(coding, 'glm-5.3').efforts!)).toEqual(['low', 'high', 'max']);
    expect(dshConfiguration(coding, 'glm-5.3', origin, initialDraft(coding, 'glm-5.3'))).toBe('');
    expect(draftProblem(coding, 'glm-5.3', initialDraft(coding, 'glm-5.3'))).toContain('尚未开放真实生成');
    for (const model of ['kimi-k2.7-code', 'kimi-k2.7-code-highspeed']) {
      const c: AgentConnection = { ...api, provider: 'kimi' }, draft = initialDraft(c, model);
      expect(presetFor(c, model).fixed).toBe(true);
      expect(dshConfiguration(c, model, origin, draft)).toContain('reasoningEfforts: false');
      expect(JSON.parse(requestExample(c, model, draft)).reasoning_effort).toBeUndefined();
    }
    for (const [provider, model] of [['zhipu', 'glm-5.3-preview'], ['mimo', 'mimo-new'], ['kimi', 'kimi-k4'], ['openai-compatible', 'glm-5.3']] as const) {
      expect(presetFor({ ...api, provider }, model).efforts).toBeNull();
    }
  });

  it('matches individual GPT versions rather than granting max to every GPT model', () => {
    expect(Object.keys(presetFor(api, 'gpt-5.1').efforts!)).toEqual(['low', 'medium', 'high']);
    expect(Object.keys(presetFor(api, 'gpt-5.2-2025-12-11').efforts!)).toEqual(['low', 'medium', 'high', 'xhigh']);
    expect(Object.keys(presetFor(api, 'gpt-6-luna').efforts!)).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    expect(presetFor(api, 'gpt-5.2-pro').efforts).toBeNull();
    expect(presetFor(api, 'gpt-6-luna-custom').efforts).toBeNull();
    for (const model of ['gpt-image-2.5-flare', 'gpt-image-2.6-flare', 'gpt-image-2.6-sunburst']) {
      expect(presetFor(api, model).unavailable).toBe(true);
      expect(dshConfiguration(api, model, origin, initialDraft(api, model))).toBe('');
    }
  });

  it.each([['medium', 'high'], ['xhigh', 'max']])('migrates saved Kimi %s to %s without changing effective effort', (oldLevel, realLevel) => {
    const saved = storage(), key = JSON.stringify(['windows:profile-a', kimi.id, kimi.provider, kimi.resource_type, 'k3.1-pro']);
    saved.setItem('selark-agent-settings-v1', JSON.stringify({ [key]: { protocol: 'openai-completions', mode: 'preset', efforts: { low: 'low', medium: 'high', high: 'high', xhigh: 'max', max: 'max' }, defaultEffort: oldLevel } }));
    const migrated = readAgentDraft(saved, 'windows:profile-a', kimi, 'k3.1-pro');
    expect(migrated.mode).toBe('preset');
    expect(migrated.defaultEffort).toBe(realLevel);
    expect(Object.keys(migrated.efforts)).toEqual(['low', 'high', 'max']);
    expect(JSON.parse(requestExample(kimi, 'k3.1-pro', migrated)).reasoning_effort).toBe(realLevel);
    expect(dshConfiguration(kimi, 'k3.1-pro', origin, migrated)).not.toContain('xhigh:');
  });

  it('exports Messages with an SDK root URL and native effort instead of Chat fields', () => {
    const c: AgentConnection = { id: 'claude', provider: 'anthropic', resource_type: 'api' };
    const draft = { ...initialDraft(c, 'claude-opus-4-6'), defaultEffort: 'max' as const };
    const config = dshConfiguration(c, 'claude-opus-4-6', origin, draft);
    expect(config).toContain('baseURL: "http://127.0.0.1:8788"');
    expect(config).toContain('forceAdaptiveThinking: true');
    expect(config).not.toContain('xhigh:');
    const body = JSON.parse(requestExample(c, 'claude-opus-4-6', draft));
    expect(body).toMatchObject({ output_config: { effort: 'max' }, thinking: { type: 'adaptive' } });
    expect(body.reasoning_effort).toBeUndefined();
  });

  it('does not infer capabilities for relays or unknown models, and accepts explicit mappings', () => {
    const c: AgentConnection = { ...api, provider: 'openai-compatible' };
    expect(presetFor(c, 'gpt-6-luna').efforts).toBeNull();
    expect(presetFor(api, 'unknown-new-model').efforts).toBeNull();
    const initial = initialDraft(c, 'custom-model');
    expect(dshConfiguration(c, 'custom-model', origin, initial)).toContain('reasoningEfforts: false');
    const custom: AgentDraft = { ...initial, mode: 'custom', efforts: { low: 'light', high: 'deep' }, defaultEffort: 'high' };
    expect(JSON.parse(requestExample(c, 'custom-model', custom)).reasoning.effort).toBe('deep');
    expect(dshConfiguration(c, 'custom-model', origin, custom)).toContain('high: "deep"');
    expect(draftProblem(c, 'custom-model', { ...custom, protocol: 'openai-completions' })).toBeTruthy();
    expect(draftProblem(c, 'custom-model', { ...custom, efforts: { high: 'high\napiKey: secret' } })).toBeTruthy();
    for (const bad of ['https://user:secret@example.com', origin + '?token=secret', origin + '/responses', 'http://remote.example']) expect(dshConfiguration(c, 'custom-model', bad, custom)).toBe('');
  });

  it('persists only model settings and isolates workspaces, connections and models', () => {
    const saved = storage(), draft: AgentDraft = { ...initialDraft(api, 'gpt-6-luna'), defaultEffort: 'max' };
    saveAgentDraft(saved, 'windows:profile-a', api, 'gpt-6-luna', { ...draft, secret: 'do-not-save' } as AgentDraft);
    expect(readAgentDraft(saved, 'windows:profile-a', api, 'gpt-6-luna')).toEqual(draft);
    expect(saved.getItem('selark-agent-settings-v1')).not.toContain('do-not-save');
    expect(readAgentDraft(saved, 'wsl:profile-a', api, 'gpt-6-luna').defaultEffort).toBe('');
    expect(readAgentDraft(saved, 'windows:profile-a', { ...api, id: 'other' }, 'gpt-6-luna').defaultEffort).toBe('');
    expect(readAgentDraft(saved, 'windows:profile-a', api, 'gpt-6-astra').defaultEffort).toBe('');
    saved.setItem('selark-agent-settings-v1', '{broken');
    expect(readAgentDraft(saved, 'windows:profile-a', api, 'gpt-6-luna')).toEqual(initialDraft(api, 'gpt-6-luna'));
  });
});
