import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { Icon } from './Icon';
import { Switch } from './ui';

export function Field({ label, hint, error, children, optional, wide }: { label: string; hint?: ReactNode; error?: string | null; children: (id: string, describedBy?: string) => ReactNode; optional?: boolean; wide?: boolean }) {
  const id = useId();
  const hintId = `${id}-hint`, errorId = `${id}-error`;
  const describedBy = [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;
  return <div className={`field${error ? ' has-error' : ''}${wide ? ' field-wide' : ''}`}>
    <label htmlFor={id}>{label}{optional && <span className="field-optional">可选</span>}</label>
    {children(id, describedBy)}
    {hint && <p className="field-hint" id={hintId}>{hint}</p>}
    {error && <p className="field-error" id={errorId} role="alert"><Icon name="alert" size={13} />{error}</p>}
  </div>;
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" autoComplete="off" spellCheck={false} {...props} />;
}

/** Integer input where empty means "no limit" (null), never zero. */
export function LimitInput({ id, value, onChange, min, max, describedBy, unit }: { id: string; value: string; onChange: (value: string) => void; min: number; max: number; describedBy?: string; unit?: string }) {
  return <div className="limit-input">
    <input id={id} className="input" inputMode="numeric" value={value} placeholder="不限" aria-describedby={describedBy}
      onChange={e => onChange(e.target.value.replace(/[^\d]/g, ''))} />
    {unit && <span className="limit-unit">{unit}</span>}
    {value !== '' && <button type="button" className="limit-clear" aria-label="清除，改为不限" onClick={() => onChange('')}><Icon name="close" size={13} /></button>}
    <span className="sr-only">范围 {min}–{max}，留空为不限</span>
  </div>;
}

export function ToggleRow({ label, description, checked, onChange, disabled }: { label: string; description?: ReactNode; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <div className="toggle-row">
    <div><p className="toggle-label">{label}</p>{description && <p className="toggle-desc">{description}</p>}</div>
    <Switch checked={checked} label={label} disabled={disabled} onChange={() => onChange(!checked)} />
  </div>;
}

export function FormSection({ title, children, description }: { title: string; children: ReactNode; description?: ReactNode }) {
  return <fieldset className="form-section">
    <legend>{title}</legend>
    {description && <p className="form-section-desc">{description}</p>}
    <div className="form-grid">{children}</div>
  </fieldset>;
}

export function Notice({ tone, children }: { tone: 'good' | 'warn' | 'bad' | 'info'; children: ReactNode }) {
  return <p className={`inline-status tone-${tone}`} role={tone === 'bad' || tone === 'warn' ? 'alert' : 'status'}>
    <Icon name={tone === 'good' ? 'check' : tone === 'info' ? 'info' : 'alert'} size={16} />
    <span>{children}</span>
  </p>;
}

export const parseLimit = (value: string): number | null => (value.trim() === '' ? null : Number(value));
export const limitText = (value: number | null | undefined) => (value == null ? '' : String(value));
