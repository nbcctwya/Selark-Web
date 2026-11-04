import { useMemo, useState } from 'react';
import App from '../App';
import { createMockApi, scenarios } from './api';
import type { Scenario } from './api';

export default function Workbench() {
  const [scenario, setScenario] = useState<Scenario>('normal');
  const [reset, setReset] = useState(0);
  const api = useMemo(() => createMockApi({ scenario }), [scenario, reset]);
  return <App key={`${scenario}-${reset}`} api={api} developmentControls={<div className="dev-toolbar">
    <strong>前端开发 · 模拟数据</strong><label>场景<select aria-label="场景" value={scenario} onChange={e => setScenario(e.target.value as Scenario)}>{Object.entries(scenarios).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
    <button className="secondary" onClick={() => setReset(value => value + 1)}>重置模拟数据</button><span>操作仅保存在本页内存中</span>
  </div>} />;
}
