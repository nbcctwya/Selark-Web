import { useId } from 'react';
import type { ReactNode } from 'react';

const paths: Record<string, ReactNode> = {
  overview: <><rect x="3.5" y="3.5" width="7" height="8" rx="2" /><rect x="13.5" y="3.5" width="7" height="5" rx="2" /><rect x="13.5" y="11.5" width="7" height="9" rx="2" /><rect x="3.5" y="14.5" width="7" height="6" rx="2" /></>,
  connections: <><path d="M9 7.5 7.3 5.8a3.2 3.2 0 0 0-4.5 4.5L5 12.5" /><path d="m15 16.5 1.7 1.7a3.2 3.2 0 0 0 4.5-4.5L19 11.5" /><path d="m8.5 15.5 7-7" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="6" r="2.5" /></>,
  usage: <><path d="M3.5 20.5h17" /><path d="M6.5 16.5v-4" /><path d="M11 16.5v-9" /><path d="M15.5 16.5v-6" /><path d="M20 16.5V4.5" /></>,
  apps: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z" /><path d="m4 7.5 8 4.5 8-4.5" /><path d="M12 12v9" /></>,
  monitor: <><path d="M3 12h4l2.5-6 5 12 2.5-6h4" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.6-4.5L4 8" /><path d="M4 3.5V8h4.5" /><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16" /><path d="M20 20.5V16h-4.5" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></>,
  moon: <><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" /></>,
  system: <><rect x="3" y="4.5" width="18" height="12" rx="2" /><path d="M8.5 20h7M12 16.5V20" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  settings: <><path d="M3 6h5m4 0h9M3 12h10m4 0h4M3 18h3m4 0h11" /><circle cx="10" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="8" cy="18" r="2" /></>,
  close: <><path d="M6 6l12 12M18 6 6 18" /></>,
  chevronRight: <path d="m9.5 6 6 6-6 6" />,
  chevronLeft: <path d="m14.5 6-6 6 6 6" />,
  chevronDown: <path d="m6 9.5 6 6 6-6" />,
  arrowRight: <><path d="M4.5 12h15" /><path d="m13.5 6 6 6-6 6" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  alert: <><path d="M12 3.5 2.8 19.5h18.4Z" /><path d="M12 10v4.5" /><path d="M12 17.3v.2" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5" /><path d="M12 7.6v.2" /></>,
  lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
  shield: <><path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6Z" /><path d="m9 12 2.2 2.2L15.5 10" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  coins: <><ellipse cx="9" cy="7" rx="5.5" ry="2.5" /><path d="M3.5 7v4c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V7" /><path d="M9.5 16.5c.3 1.3 2.7 2.5 5.5 2.5 3 0 5.5-1.1 5.5-2.5v-4c0-1.2-1.8-2.2-4.3-2.4" /></>,
  token: <><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z" /><path d="M9 10h6M12 10v6" /></>,
  calls: <><path d="M4 7h11" /><path d="m12 3.5 3.5 3.5-3.5 3.5" /><path d="M20 17H9" /><path d="m12 13.5-3.5 3.5 3.5 3.5" /></>,
  sparkle: <><path d="M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5Z" /><path d="M18.5 15.5c.3 1.6.9 2.2 2.5 2.5-1.6.3-2.2.9-2.5 2.5-.3-1.6-.9-2.2-2.5-2.5 1.6-.3 2.2-.9 2.5-2.5Z" /></>,
  filter: <><path d="M4 5.5h16" /><path d="M7 12h10" /><path d="M10 18.5h4" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  database: <><ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" /><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13" /><path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" /></>,
  archive: <><rect x="3" y="4" width="18" height="5" rx="1.5" /><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9" /><path d="M10 13h4" /></>,
  server: <><rect x="3.5" y="4" width="17" height="7" rx="2" /><rect x="3.5" y="13" width="17" height="7" rx="2" /><path d="M7.5 7.5h.1M7.5 16.5h.1" /></>,
  key: <><circle cx="8" cy="15" r="4.5" /><path d="m11.2 11.8 8.3-8.3M16.5 6.5l2.5 2.5M14 9l2 2" /></>,
  star: <path d="m12 3.8 2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.7l-5.1 2.7 1-5.6-4.1-4 5.7-.8Z" />,
  wifiOff: <><path d="M3 3l18 18" /><path d="M8.5 16.4a5 5 0 0 1 7 0" /><path d="M5 12.9a10 10 0 0 1 4.2-2.4M19 12.9a10 10 0 0 0-2.5-1.7" /><path d="M2 9.3a15 15 0 0 1 4.3-2.8M22 9.3A15 15 0 0 0 11 5.1" /><path d="M12 20h.01" /></>,
  command: <path d="M9 6.5A2.5 2.5 0 1 0 6.5 9H9Zm0 0v11m0-11h6m-6 11A2.5 2.5 0 1 1 6.5 15H9Zm0 0h6m0 0a2.5 2.5 0 1 0 2.5-2.5H15Zm0 0v-11m0 0A2.5 2.5 0 1 1 17.5 9H15" />,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  sidebar: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16M5.5 8h1M5.5 11h1M5.5 14h1" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5Z" /><path d="m3 12.5 9 5 9-5" /><path d="m3 17 9 5 9-5" /></>,
  user: <><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></>,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="m7 9.5 3 2.5-3 2.5M12.5 15h4.5" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></>,
  bolt: <path d="M13 2.5 4.5 13.5H12L11 21.5l8.5-11H12Z" />,
  gauge: <><path d="M4 17a8.5 8.5 0 1 1 16 0" /><path d="m12 13.5 4-4.5" /><circle cx="12" cy="14" r="1.3" /></>,
};
export type IconName = keyof typeof paths;

export function Icon({ name, size = 18, className, title }: { name: IconName; size?: number; className?: string; title?: string }) {
  return <svg className={className ? `icon ${className}` : 'icon'} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
    {title && <title>{title}</title>}
    {paths[name]}
  </svg>;
}

/** Selark brand mark: a stylised "S" arc inside a rounded tile. */
export function Mark({ size = 30 }: { size?: number }) {
  const id = `mark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return <svg className="mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" className="mark-a" />
        <stop offset="1" className="mark-b" />
      </linearGradient>
    </defs>
    <rect x="1" y="1" width="30" height="30" rx="9" fill={`url(#${id})`} />
    <path d="M21.5 10.2c-1.3-1.5-3.3-2.3-5.5-2.3-3.2 0-5.6 1.7-5.6 4.2 0 5.4 11.4 2.8 11.4 8.1 0 2.6-2.5 4.2-5.8 4.2-2.4 0-4.5-.9-5.8-2.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
    <circle cx="23.2" cy="8.6" r="1.7" fill="#fff" opacity=".85" />
  </svg>;
}
