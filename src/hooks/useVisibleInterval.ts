import { useEffect } from 'react';

/** Sleep while the tab is hidden; update once when the user returns. */
export function useVisibleInterval(callback: () => void, delay: number | null) {
  useEffect(() => {
    if (delay == null) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const schedule = () => {
      clearInterval(timer);
      timer = document.visibilityState === 'visible' ? setInterval(callback, delay) : undefined;
    };
    const visibility = () => {
      schedule();
      if (document.visibilityState === 'visible') callback();
    };
    schedule();
    document.addEventListener('visibilitychange', visibility);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visibility); };
  }, [callback, delay]);
}
