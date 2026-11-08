import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { createHttpApi } from './api/http';
import './styles.css';

const root = createRoot(document.getElementById('root')!);
// Consume once, before React effects. Never retain the login token in the URL.
const bootstrap = new URLSearchParams(location.hash.slice(1)).get('login');
if (location.hash || location.search) history.replaceState(null, '', location.pathname);

if (window.selark) {
  const { default: DesktopRoot } = await import('./desktop/DesktopRoot');
  root.render(<StrictMode><DesktopRoot /></StrictMode>);
} else if (import.meta.env.DEV) {
  const { default: Workbench } = await import('./mocks/Workbench');
  root.render(<StrictMode><Workbench /></StrictMode>);
} else {
  const api = createHttpApi();
  root.render(<StrictMode><App api={api} bootstrap={bootstrap} /></StrictMode>);
}
