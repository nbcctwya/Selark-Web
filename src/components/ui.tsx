import { useEffect, useId, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { hueIndex, initials, tone as toneOf } from '../lib/format';
import type { Tone } from '../lib/format';

export function Pill({ tone = 'neutral', children, dot = true, title }: { tone?: Tone; children: ReactNode; dot?: boolean; title?: string }) {
  return <span className={`pill tone-${tone}`} title={title}>{dot && <span className="pill-dot" aria-hidden="true" />}{children}</span>;
}

export function StatusPill({ value, text }: { value: string | null | undefined; text: string }) {
  return <Pill tone={toneOf(value)}>{text}</Pill>;
}

export function Tag({ children, mono = false, tone }: { children: ReactNode; mono?: boolean; tone?: 'accent' | 'muted' }) {
  return <span className={`tag${mono ? ' mono' : ''}${tone ? ` tag-${tone}` : ''}`}>{children}</span>;
}

/** Unknown values get their own visual treatment so they never read as zero. */
export function Unknown({ children = '未知' }: { children?: ReactNode }) {
  return <span className="unknown">{children}</span>;
}

export function Panel({ title, subtitle, actions, children, className = '', id, icon }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string; icon?: IconName }) {
  const headingId = useId();
  return <section className={`panel ${className}`} aria-labelledby={title ? headingId : undefined} id={id}>
    {(title || actions) && <header className="panel-head">
      <div className="panel-titles">
        {title && <h2 id={headingId}>{icon && <Icon name={icon} size={16} />}{title}</h2>}
        {subtitle && <p className="panel-sub">{subtitle}</p>}
      </div>
      {actions && <div className="panel-actions">{actions}</div>}
    </header>}
    {children}
  </section>;
}

export function Empty({ icon = 'sparkle', title, children, tone }: { icon?: IconName; title: string; children?: ReactNode; tone?: 'error' }) {
  return <div className={`empty${tone ? ` empty-${tone}` : ''}`}>
    <span className="empty-icon"><Icon name={icon} size={20} /></span>
    <p className="empty-title">{title}</p>
    {children && <div className="empty-text">{children}</div>}
  </div>;
}

export function Avatar({ id, text, kind = 'square', size = 'md' }: { id: string; text: string; kind?: 'square' | 'round'; size?: 'sm' | 'md' | 'lg' }) {
  return <span className={`avatar avatar-${kind} avatar-${size} hue-${hueIndex(id)}`} aria-hidden="true">{initials(text)}</span>;
}

export function Kbd({ children }: { children: ReactNode }) { return <kbd className="kbd">{children}</kbd>; }

export function Button({ children, variant = 'default', icon, size, className, ...rest }: { children?: ReactNode; variant?: 'default' | 'primary' | 'ghost' | 'danger'; icon?: IconName; size?: 'sm' } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`btn btn-${variant}${size ? ` btn-${size}` : ''}${children ? '' : ' btn-icon'}${className ? ` ${className}` : ''}`} {...rest}>
    {icon && <Icon name={icon} size={size === 'sm' ? 15 : 16} />}{children}
  </button>;
}

export function Segmented<T extends string>({ value, options, onChange, label, size }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (value: T) => void; label: string; size?: 'sm' }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(event: KeyboardEvent, index: number) {
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }
  return <div className={`segmented${size ? ` segmented-${size}` : ''}`} role="radiogroup" aria-label={label}>
    {options.map((option, index) => <button key={option.value} type="button" role="radio" ref={el => { refs.current[index] = el; }}
      aria-checked={value === option.value} tabIndex={value === option.value ? 0 : -1} title={option.title}
      className={value === option.value ? 'on' : ''} onClick={() => onChange(option.value)} onKeyDown={e => onKey(e, index)}>{option.label}</button>)}
  </div>;
}

export function Switch({ checked, onChange, label, disabled, busy }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean; busy?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} aria-busy={busy || undefined} disabled={disabled}
    className={`switch${checked ? ' on' : ''}${busy ? ' busy' : ''}`} onClick={onChange}><span className="switch-thumb" /></button>;
}

/** Horizontal bar drawn with SVG attributes only (no inline styles under the production CSP). */
export function Bar({ value, max, tone = 'accent', label, track = true }: { value: number | null; max: number; tone?: 'accent' | 'good' | 'warn' | 'bad' | 'muted'; label?: string; track?: boolean }) {
  const ratio = value == null || max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  return <svg className={`bar bar-${tone}`} viewBox="0 0 100 8" preserveAspectRatio="none" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    {track && <rect className="bar-track" x="0" y="0" width="100" height="8" rx="4" />}
    {value == null ? <rect className="bar-unknown" x="0" y="0" width="100" height="8" rx="4" />
      : ratio > 0 && <rect className="bar-fill" x="0" y="0" width={Math.max(ratio * 100, 2)} height="8" rx="4" />}
  </svg>;
}

export function Ring({ value, max, size = 64, label, tone = 'accent', children }: { value: number | null | undefined; max: number | null | undefined; size?: number; label: string; tone?: 'accent' | 'good' | 'warn' | 'bad'; children?: ReactNode }) {
  const r = 26, c = 2 * Math.PI * r;
  const known = value != null && max != null && max > 0;
  const ratio = known ? Math.max(0, Math.min(1, value / max)) : 0;
  return <div className="ring" role="img" aria-label={label}>
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle className="ring-track" cx="32" cy="32" r={r} fill="none" strokeWidth="6" strokeDasharray={known ? undefined : '3 5'} />
      {known && ratio > 0 && <circle className={`ring-fill ring-${tone}`} cx="32" cy="32" r={r} fill="none" strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${c * ratio} ${c}`} transform="rotate(-90 32 32)" />}
    </svg>
    {children && <div className="ring-center">{children}</div>}
  </div>;
}

export function DefinitionList({ items, columns }: { items: [ReactNode, ReactNode][]; columns?: 1 | 2 }) {
  return <dl className={`deflist${columns === 1 ? ' deflist-1' : ''}`}>
    {items.map(([key, value], index) => <div key={index}><dt>{key}</dt><dd>{value ?? <Unknown />}</dd></div>)}
  </dl>;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" />;
}

/** Ticks once a while so relative times ("3 分钟前") stay honest without re-reading data. */
export function useNow(interval = 15000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), interval); return () => clearInterval(id); }, [interval]);
  return now;
}

/** Element width for SVG charts so text in the viewBox is never stretched. */
export function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setWidth(Math.max(240, Math.round(element.clientWidth)));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** WAI-ARIA tabs: arrow keys move focus and selection. Panels use id `panel-<key>`. */
export function Tabs<T extends string>({ value, onChange, tabs, label: name }: { value: T; onChange: (value: T) => void; tabs: [T, string][]; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(event: KeyboardEvent, index: number) {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + tabs.length) % tabs.length;
    onChange(tabs[next][0]); refs.current[next]?.focus();
  }
  return <div className="tabs" role="tablist" aria-label={name}>{tabs.map(([key, text], index) =>
    <button key={key} type="button" role="tab" id={`tab-${key}`} aria-controls={`panel-${key}`} aria-selected={value === key} tabIndex={value === key ? 0 : -1}
      ref={el => { refs.current[index] = el; }} onClick={() => onChange(key)} onKeyDown={e => onKey(e, index)}>{text}</button>)}</div>;
}
