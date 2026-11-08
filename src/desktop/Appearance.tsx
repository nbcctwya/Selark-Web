import { useEffect, useRef } from 'react';
import { Icon } from '../components/Icon';
import { Button } from '../components/ui';

export type Appearance = 'fluent' | 'macos' | 'blend';
export const appearances: { id: Appearance; name: string; caption: string; description: string }[] = [
  { id: 'fluent', name: 'Win11 Fluent', caption: '清晰 · 有序', description: '轻盈的云灰底色、紧凑工具栏和侧边选中标记。' },
  { id: 'macos', name: 'macOS', caption: '轻盈 · 专注', description: '统一工具栏、柔雾侧栏与居中的分组设置面板。' },
  { id: 'blend', name: '融合', caption: '柔和 · 从容', description: '鼠尾草绿点缀、悬浮内容区和舒展的留白。' },
];

export function readAppearance(): Appearance {
  try { const value = localStorage.getItem('selark-appearance'); return value === 'macos' || value === 'blend' ? value : 'fluent'; }
  catch { return 'fluent'; }
}

export function AppearancePicker({ open, value, onChange, onClose }: { open: boolean; value: Appearance; onChange: (value: Appearance) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    if (!open && ref.current?.open) ref.current.close();
  }, [open]);
  return <dialog ref={ref} className="appearance-picker" aria-labelledby="appearance-title" onClose={onClose}>
    <header className="appearance-head">
      <div><h2 id="appearance-title">选择你的桌面风格</h2><p>即时切换，找到用起来最舒服的那一种。</p></div>
      <Button variant="ghost" icon="close" aria-label="关闭外观设置" onClick={onClose} />
    </header>
    <div className="appearance-options" role="radiogroup" aria-label="桌面风格">
      {appearances.map(item => <label key={item.id} className={`appearance-option preview-${item.id}`}>
        <input type="radio" name="desktop-appearance" aria-label={item.name} value={item.id} checked={value === item.id} onChange={() => onChange(item.id)} />
        <span className="appearance-preview" aria-hidden="true">
          <span className="preview-title"><i /><i /><i /></span>
          <span className="preview-side"><b /><i /><i /><i /><i /></span>
          <span className="preview-content"><b /><span className="preview-metrics"><i /><i /><i /></span><span className="preview-chart"><i /><i /><i /><i /><i /><i /><i /><i /></span></span>
        </span>
        <span className="appearance-option-title"><strong>{item.name}</strong><Icon name={value === item.id ? 'check' : 'chevronRight'} size={16} /></span>
        <span className="appearance-caption">{item.caption}</span>
        <span className="appearance-description">{item.description}</span>
      </label>)}
    </div>
    <footer className="appearance-foot"><p>三种风格均支持浅色与深色。选择会自动保存。</p><Button variant="primary" onClick={onClose}>完成</Button></footer>
  </dialog>;
}
