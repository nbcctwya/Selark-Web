import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { createHttpApi } from './api/http';
import './styles.css';

// Resolve the theme before the first paint to avoid a light flash on dark systems.
try {
  const saved = localStorage.getItem('selark-theme');
  document.documentElement.dataset.theme = saved === 'dark' || (saved !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
} catch { /* Preference only. */ }

const root = createRoot(document.getElementById('root')!);
// Consume once, before React effects. Never retain the login token in the URL.
const bootstrap = new URLSearchParams(location.hash.slice(1)).get('login');
if (location.hash || location.search) history.replaceState(null, '', location.pathname);

if (import.meta.env.DEV) {
  const { default: Workbench } = await import('./mocks/Workbench');
  root.render(<StrictMode><Workbench /></StrictMode>);
} else {
  const api = createHttpApi();
  root.render(<StrictMode><App api={api} bootstrap={bootstrap} /></StrictMode>);
}
