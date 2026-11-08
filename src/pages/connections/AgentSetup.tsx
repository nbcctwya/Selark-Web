import { useEffect, useState } from 'react';
import type { Connection } from '../../api/types';
import { Field, FormSection, Notice, TextInput } from '../../components/form';
import { Button, Empty } from '../../components/ui';
import { dshConfiguration, draftProblem, effectiveEfforts, gatewayUrl, initialDraft, levels, presetFor, protocolNames, protocolsFor, readAgentDraft, reasoningLabel, requestExample, saveAgentDraft } from '../../lib/agent-config';
import type { AgentDraft, Effort, Protocol } from '../../lib/agent-config';

export function AgentSetup({ c }: { c: Connection }) {
  const [selected, setSelected] = useState(c.default_model ?? c.models[0] ?? '');
  const model = c.models.includes(selected) ? selected : c.models[0] ?? '';
  const [address, setAddress] = useState('');
  const [scope, setScope] = useState<string | null>(window.selark ? null : `web:${location.origin}`);
  useEffect(() => {
    let active = true;
    // Read the current workspace once. Never poll or discover models to render this form.
    void window.selark?.config().then(config => {
      if (!active) return;
      if (config.connectionMode === 'windows') {
        setAddress(value => value || config.nativeInfo?.gatewayUrl || '');
        setScope(`windows:${config.nativeInfo?.configDir || config.windows?.configDir || config.nativeConfigDir || 'default'}`);
      } else if (config.connectionMode === 'wsl') {
        setScope(`wsl:${JSON.stringify([config.wsl?.distribution || '', config.wsl?.configDir || ''])}`);
      } else setScope(`manual:${config.endpoint}`);
    }).catch(() => { if (active) setScope(''); });
    return () => { active = false; };
  }, []);
  if (!model) return <Empty icon="terminal" title="先启用一个模型">在「模型目录」启用模型后，这里会生成对应的客户端配置。</Empty>;
  return <div className="form">
    <FormSection title="客户端推理档位" description="按供应商和具体型号自动匹配推理能力；支持档位的模型可导出到客户端，在会话中选择。">
      <Field label="接入模型">{id => <select id={id} className="input" value={model} onChange={event => setSelected(event.target.value)}>
        {c.models.map(id => <option key={id} value={id}>{id}</option>)}
      </select>}</Field>
      <Field label="Selark API 地址" hint="网关地址：Windows 默认 8788，WSL 默认 8787。填写客户端可访问的地址。" error={address && !gatewayUrl(address) ? '请输入网关根地址或 /v1 地址，不含凭据、查询参数或片段。' : null}>{(id, d) =>
        <TextInput id={id} type="url" value={address} aria-describedby={d} placeholder="http://127.0.0.1:8788/v1" onChange={event => setAddress(event.target.value.trim())} />}</Field>
    </FormSection>
    {scope === null ? <p className="field-hint">正在读取当前工作空间…</p> : <ModelSetup key={JSON.stringify([scope, c.id, model])} c={c} model={model} address={address} scope={scope} />}
  </div>;
}

function ModelSetup({ c, model, address, scope }: { c: Connection; model: string; address: string; scope: string }) {
  const preset = presetFor(c, model);
  const [draft, setDraft] = useState<AgentDraft>(() => {
    try { return scope ? readAgentDraft(localStorage, scope, c, model) : initialDraft(c, model); } catch { return initialDraft(c, model); }
  });
  const [saveState, setSaveState] = useState<'idle' | 'done' | 'failed'>('idle');
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'failed'>('idle');
  const efforts = effectiveEfforts(c, model, draft), problem = draftProblem(c, model, draft);
  const config = dshConfiguration(c, model, address, draft);
  const path = draft.protocol === 'openai-responses' ? '/v1/responses' : draft.protocol === 'anthropic-messages' ? '/v1/messages' : '/v1/chat/completions';
  useEffect(() => { setCopyState('idle'); }, [config]);
  function change(next: AgentDraft) { setDraft(next); setSaveState('idle'); }
  function setMode(mode: AgentDraft['mode']) {
    change({ ...draft, mode, efforts: mode === 'preset' ? { ...preset.efforts } : draft.efforts, defaultEffort: '' });
  }
  function toggle(level: Effort, checked: boolean) {
    const next = { ...draft.efforts };
    if (checked) next[level] = level; else delete next[level];
    change({ ...draft, efforts: next, defaultEffort: draft.defaultEffort === level && !checked ? '' : draft.defaultEffort });
  }
  function save() {
    try { saveAgentDraft(localStorage, scope, c, model, draft); setSaveState('done'); } catch { setSaveState('failed'); }
  }
  async function copy() {
    if (!config) return;
    try { await (window.selark ? window.selark.copyText(config) : navigator.clipboard.writeText(config)); setCopyState('done'); } catch { setCopyState('failed'); }
  }
  return <>
    <Notice tone="info"><strong>{reasoningLabel(preset)}</strong><br />{preset.note}</Notice>
    <FormSection title="模型选项">
      <Field label="接入协议" hint="选择上游支持的协议；工具调用优先使用供应商原生协议。">{id => <select id={id} className="input" value={draft.protocol} onChange={e => change({ ...draft, protocol: e.target.value as Protocol })}>
        {protocolsFor(c).map(protocol => <option key={protocol} value={protocol}>{protocolNames[protocol]}</option>)}
      </select>}</Field>
      <Field label="档位配置">{id => <select id={id} className="input" value={draft.mode} onChange={e => setMode(e.target.value as AgentDraft['mode'])}>
        <option value="preset" disabled={preset.efforts === null}>自动识别模型档位（推荐）</option><option value="custom" disabled={preset.fixed || Boolean(preset.control)}>手动覆盖（高级）</option><option value="default">使用服务默认值</option>
      </select>}</Field>
      {draft.mode === 'custom' && <div className="field field-wide agent-efforts">
        <p className="field-hint">勾选客户端可选的档位，右侧填写发送给供应商的实际值。只启用此模型确实支持的值。</p>
        {levels.map(level => <div className="agent-effort" key={level}>
          <label><input type="checkbox" checked={draft.efforts[level] !== undefined} onChange={e => toggle(level, e.target.checked)} />{level}</label>
          <span aria-hidden="true">→</span><TextInput aria-label={`${level} 的 API 值`} value={draft.efforts[level] ?? ''} disabled={draft.efforts[level] === undefined} maxLength={32} onChange={e => change({ ...draft, efforts: { ...draft.efforts, [level]: e.target.value } })} />
        </div>)}
      </div>}
      {draft.mode === 'preset' && Object.keys(efforts).length > 0 && <div className="field field-wide agent-recognized" aria-label="模型实际推理档位">{levels.filter(level => efforts[level]).map(level => <span key={level}>{level}</span>)}</div>}
      <Field label="客户端默认档位" hint={preset.fixed || preset.control ? '此模型没有可选的 effort 档位。' : '会话选择优先于此默认值；未指定时沿用服务默认值。'}>{id => <select id={id} className="input" disabled={preset.fixed || Boolean(preset.control)} value={draft.defaultEffort} onChange={e => change({ ...draft, defaultEffort: e.target.value as Effort | '' })}>
        <option value="">不指定</option>{levels.filter(level => efforts[level]).map(level => <option key={level} value={level}>{level}</option>)}
      </select>}</Field>
      <div className="field field-wide"><div className="agent-actions"><Button disabled={Boolean(problem) || !scope} onClick={save}>{saveState === 'done' ? '已保存模型选项' : '保存模型选项'}</Button></div><p className="field-hint">保存在当前桌面工作空间，供下次导出使用。应用到 DSH 后，在 DSH 会话中选择档位。</p></div>
    </FormSection>
    {problem && <Notice tone="warn">{problem}</Notice>}
    {saveState === 'failed' && <Notice tone="warn">本机存储不可用；仍可复制当前配置。</Notice>}
    {preset.control && <Notice tone="info">{preset.control === 'switch' ? '已识别此模型的思考开关。' : '已识别此模型的思考预算。'}DSH 导出采用服务默认行为，不添加 Effort 菜单。需要逐次控制时，请在支持此参数的客户端配置；下方请求示例给出实际字段。</Notice>}
    {draft.protocol === 'anthropic-messages' && Object.keys(efforts).length > 0 && <p className="field-hint">Messages 档位配置使用自适应思考。仅支持 budget_tokens 的旧模型需在客户端设置思考预算，不能直接使用 effort 档位。</p>}
    <ol className="agent-steps">
      <li>在「应用管理」创建客户端应用并授权此模型。{c.resource_type === 'token_plan' ? '启用「允许 Token Plan」，明确选择此连接。套餐用于本人交互式编程。' : ''}</li>
      <li>将 Selark 应用令牌保存为 DSH 进程可读取的 <code>SELARK_API_KEY</code>，将下方 provider 合并到 <code>cordis.patch.yml</code>。</li>
      <li>{Object.keys(efforts).length ? '在 DSH 中选中模型，通过 Effort 菜单选择档位。已有提供商可在 Settings → Models → Customized settings → Model options → Reasoning levels 中配置。' : '在 DSH 中选中模型；此配置不添加 Effort 档位菜单。'}</li>
    </ol>
    <p className="field-hint">识别规则随桌面版本更新，不发送生成探测请求。未知型号需按供应商说明配置。DSH 发现模型时不会自动添加档位，需要合并下方配置。</p>
    <Field label="DSH 配置" wide hint="配置不包含上游密钥；只生成本地文本，不调用模型。">{id => <textarea id={id} className="input agent-config" readOnly spellCheck={false} value={config} placeholder={problem || '填写 API 地址后生成配置'} />}</Field>
    <div className="agent-actions"><Button icon={copyState === 'done' ? 'check' : undefined} disabled={!config} onClick={() => void copy()}>{copyState === 'done' ? '已复制 DSH 配置' : '复制 DSH 配置'}</Button></div>
    {copyState === 'failed' && <Notice tone="warn">剪贴板不可用，请从文本框手动复制。</Notice>}
    <details className="agent-example"><summary>其他客户端 · 请求示例</summary><p className="field-hint">POST <code>{path}</code>，使用 Selark 应用令牌认证。{preset.control === 'switch' ? '自动识别模式的示例开启思考；关闭时将 thinking.type 改为 disabled。此开关不写入上方 DSH 配置。' : preset.control === 'budget' ? '自动识别模式的示例使用 1024 Token 思考预算，可按需修改并保持小于 max_tokens；此预算不写入上方 DSH 配置。' : '示例采用当前默认档位或第一个已启用档位，可在每次请求时更改。'}</p>
      <Field label="请求 JSON">{id => <textarea id={id} className="input agent-config" readOnly spellCheck={false} value={problem ? '' : requestExample(c, model, draft)} />}</Field>
    </details>
  </>;
}
