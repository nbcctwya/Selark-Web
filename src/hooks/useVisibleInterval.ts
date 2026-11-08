import { useEffect } from 'react';

/** Sleep while the tab is hidden; update once when the user returns. */
export function useVisibleInterval(callback: () => void, delay: number | null) {
  useEffect(() => {
    if (delay == null) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    let alive = true;
    let nativeVisible = !window.selark;
    let visible = false;
    const schedule = () => {
      clearInterval(timer);
      visible = document.visibilityState === 'visible' && nativeVisible;
      timer = visible ? setInterval(callback, delay) : undefined;
    };
    const visibility = () => {
      const previous = visible;
      schedule();
      if (visible && !previous) callback();
    };
    const unsubscribe = window.selark?.onVisibility(value => { nativeVisible = value; visibility(); });
    void window.selark?.config().then(value => { if (alive) { nativeVisible = value.visible ?? true; schedule(); } });
    schedule();
    document.addEventListener('visibilitychange', visibility);
    return () => { alive = false; clearInterval(timer); unsubscribe?.(); document.removeEventListener('visibilitychange', visibility); };
  }, [callback, delay]);
}
