import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Snapshot } from '../api/types';
import { label } from '../lib/format';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { Kbd } from './ui';

export interface Command { id: string; group: string; title: string; hint?: string; icon: IconName; keywords?: string; run: () => void; shortcut?: string }

export function CommandPalette({ open, onClose, base, snapshot, go }: { open: boolean; onClose: () => void; base: Command[]; snapshot: Snapshot | null; go: (page: 'connections' | 'applications', id: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) { setQuery(''); setIndex(0); element.showModal(); input.current?.focus(); }
    if (!open && element.open) element.close();
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    if (!snapshot) return base;
    return [
      ...base,
      ...snapshot.connections.map(c => ({ id: `c:${c.id}`, group: '连接', title: c.name, hint: `${label(c.resource_type)} · ${c.id}`, icon: 'connections' as const, keywords: `${c.id} ${c.provider}`, run: () => go('connections', c.id) })),
      ...snapshot.connections.flatMap(c => c.model_catalog.models.map(m => ({ id: `m:${c.id}:${m.id}`, group: '模型', title: m.id, hint: `${c.name} · ${m.approved ? '已启用' : '未启用'}${m.default ? ' · 默认' : ''}`, icon: 'layers' as const, keywords: c.name, run: () => go('connections', c.id) }))),
      ...snapshot.applications.map(a => ({ id: `a:${a.id}`, group: '应用', title: a.name, hint: `${a.id} · ${a.active ? '有效' : '已撤销'}`, icon: 'apps' as const, keywords: a.id, run: () => go('applications', a.id) })),
    ];
  }, [base, snapshot, go]);

  const term = query.trim().toLowerCase();
  const results = (term ? commands.filter(c => `${c.title} ${c.hint ?? ''} ${c.keywords ?? ''} ${c.group}`.toLowerCase().includes(term)) : commands.filter(c => c.group === '页面' || c.group === '操作')).slice(0, 40);
  const active = Math.min(index, Math.max(0, results.length - 1));

  function run(command: Command | undefined) {
    if (!command) return;
    dialog.current?.close();
    command.run();
  }
  function onKey(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') { event.preventDefault(); setIndex((active + 1) % Math.max(1, results.length)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setIndex((active - 1 + results.length) % Math.max(1, results.length)); }
    else if (event.key === 'Enter') { event.preventDefault(); run(results[active]); }
  }
  useEffect(() => { document.getElementById(`cmd-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active]);

  let lastGroup = '';
  return <dialog ref={dialog} className="palette" aria-label="命令面板" onClose={event => { if (event.target === dialog.current) onClose(); }} onClick={event => { if (event.target === dialog.current) dialog.current?.close(); }}>
    {open && <div className="palette-inner">
      <div className="palette-search">
        <Icon name="search" size={18} />
        <input ref={input} value={query} onChange={e => { setQuery(e.target.value); setIndex(0); }} onKeyDown={onKey}
          placeholder="搜索页面、连接、模型或应用…" aria-label="搜索命令" role="combobox" aria-expanded="true" aria-controls="palette-list"
          aria-activedescendant={results.length ? `cmd-${active}` : undefined} autoComplete="off" spellCheck={false} />
        <Kbd>Esc</Kbd>
      </div>
      <ul id="palette-list" role="listbox" className="palette-list" aria-label="结果">
        {results.map((c, i) => {
          const header = c.group !== lastGroup ? c.group : null;
          lastGroup = c.group;
          return <li key={c.id} role="presentation">
            {header && <p className="palette-group" aria-hidden="true">{header}</p>}
            <div id={`cmd-${i}`} role="option" aria-selected={i === active} className={`palette-item${i === active ? ' on' : ''}`}
              onPointerMove={() => setIndex(i)} onClick={() => run(c)}>
              <Icon name={c.icon} size={16} />
              <span className="palette-title">{c.title}</span>
              {c.hint && <span className="palette-hint">{c.hint}</span>}
              {c.shortcut && <Kbd>{c.shortcut}</Kbd>}
            </div>
          </li>;
        })}
        {!results.length && <li className="palette-empty">没有匹配“{query}”的结果</li>}
      </ul>
      <p className="palette-foot"><span><Kbd>↑</Kbd><Kbd>↓</Kbd> 选择</span><span><Kbd>↵</Kbd> 打开</span><span><Kbd>1</Kbd>–<Kbd>5</Kbd> 切换页面</span><span><Kbd>R</Kbd> 刷新</span></p>
    </div>}
  </dialog>;
}
