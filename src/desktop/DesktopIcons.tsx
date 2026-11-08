export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    connections: 'M9 7V3m6 4V3M7 7h10v5a5 5 0 0 1-10 0V7zm5 10v4',
    usage: 'M4 20V10m8 10V4m8 16v-7',
    applications: 'M8 3H4v6h4m8-6h4v6h-4M8 21H4v-6h4m8 6h4v-6h-4M9 9h6v6H9z',
    monitor: 'M3 12h4l3-7 4 14 3-7h4',
    refresh: 'M20 7a9 9 0 1 0 1 8M20 2v5h-5',
    settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 4l16 16M4 20L20 4M12 2v3m0 14v3M2 12h3m14 0h3',
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1',
    plus: 'M12 5v14M5 12h14',
    arrow: 'M5 12h14m-6-6 6 6-6 6',
    shield: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3zM8 12l3 3 5-6',
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.overview} /></svg>;
}

export function Logo() {
  return <svg className="logo" width="34" height="34" viewBox="0 0 36 36" fill="none" aria-hidden="true"><rect width="36" height="36" rx="11" fill="currentColor"/><path d="m24 10-12 5 12 6-12 5M12 15v-5m12 11v5" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
