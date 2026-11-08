const { app, BrowserWindow, ipcMain, protocol, net, Menu, session, clipboard, dialog, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { Backend, endpoint } = require('./backend.cjs');
const { WslDashboard, listDistributions, settings: wslSettings } = require('./wsl.cjs');
const { NativeDashboard, settings: nativeSettings } = require('./native.cjs');

protocol.registerSchemesAsPrivileged([{ scheme: 'selark', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
// Test profiles are isolated from the user's preferences and contain no real sessions.
if (process.env.SELARK_TEST_PROFILE && !app.isPackaged) app.setPath('userData', path.resolve(process.env.SELARK_TEST_PROFILE));
const backend = new Backend();
const wsl = new WslDashboard(backend);
const native = new NativeDashboard(backend, {
  executable: app.isPackaged ? path.join(process.resourcesPath, 'backend', 'selark-core.exe') : path.resolve(__dirname, '../../backend/dist/selark-core/selark-core.exe'),
  defaultConfigDir: path.join(process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local'), 'Selark', 'config'),
});
const launchMode = process.argv.find(value => /^--backend=(windows|wsl|choose)$/.test(value))?.split('=')[1];
let window;
let preferences = {};
let quitting = false;
let connectionGeneration = 0;
let switching = false;
const configPath = () => path.join(app.getPath('userData'), 'preferences.json');
const trusted = event => event.sender === window?.webContents && event.senderFrame?.url.startsWith('selark://app/');
const handle = (channel, fn) => ipcMain.handle(channel, (event, ...args) => {
  if (!trusted(event)) throw new Error('不允许的调用来源。');
  return fn(...args);
});

let saving = Promise.resolve();
function persist() {
  const contents = JSON.stringify(preferences);
  saving = saving.catch(() => {}).then(async () => {
    const temporary = configPath() + '.tmp';
    await fs.mkdir(path.dirname(configPath()), { recursive: true });
    await fs.writeFile(temporary, contents, 'utf8');
    await fs.rename(temporary, configPath());
  });
  return saving;
}

function config() {
  return { endpoint: backend.origin, connected: !!backend.session, version: app.getVersion(),
    visible: !!window && window.isVisible() && !window.isMinimized(),
    connectionMode: preferences.connectionMode ?? null, wsl: wslSettings(preferences.wsl),
    windows: nativeSettings(preferences.windows), nativeInfo: native.info,
    nativeConfigDir: native.defaultConfigDir, chooseBackend: launchMode === 'choose' };
}

async function stopManaged() { await Promise.all([wsl.stop(), native.stop()]); }
async function cancelConnection() { connectionGeneration++; await stopManaged(); }
async function connectWorkspace(mode, input) {
  if (switching) throw new Error('正在切换工作空间，请稍候。');
  switching = true;
  const generation = ++connectionGeneration;
  try {
    const options = mode === 'windows' ? nativeSettings(input ?? preferences.windows) : mode === 'wsl' ? wslSettings(input ?? preferences.wsl) : input;
    if (mode === 'manual' || preferences.connectionMode !== mode) await stopManaged();
    if (generation !== connectionGeneration || quitting) throw new Error('连接已取消。');
    if (mode === 'windows') await native.start(options);
    else if (mode === 'wsl') await wsl.start(options);
    else await backend.connect(options);
    if (generation !== connectionGeneration || quitting) { await stopManaged(); throw new Error('连接已取消。'); }
    preferences.connectionMode = mode;
    if (mode !== 'manual') preferences[mode === 'windows' ? 'windows' : 'wsl'] = options;
    preferences.endpoint = backend.origin;
    await persist().catch(() => {});
    return config();
  } finally { switching = false; }
}

function finishQuit() {
  if (quitting) return;
  quitting = true;
  backend.close();
  connectionGeneration++;
  Promise.allSettled([stopManaged(), persist()]).finally(() => app.quit());
}

// Windows owns the caption buttons. Update their colors only on theme events.
function updateWindowTheme() {
  if (!window || window.isDestroyed()) return;
  const dark = nativeTheme.shouldUseDarkColors;
  window.setTitleBarOverlay({ color: '#00000000', symbolColor: dark ? '#eeeeee' : '#242424', height: 48 });
  window.setBackgroundColor(dark ? '#202020' : '#f3f3f3');
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_event, argv) => {
    if (window?.isMinimized()) window.restore(); window?.show(); window?.focus();
    const mode = argv.find(value => /^--backend=(windows|wsl|choose)$/.test(value))?.split('=')[1];
    if (mode) window?.webContents.send('desktop:choose-backend', mode);
  });
  app.whenReady().then(async () => {
    app.setAppUserModelId('com.selark.desktop');
    try {
      preferences = JSON.parse(await fs.readFile(configPath(), 'utf8'));
      preferences.wsl = wslSettings(preferences.wsl);
      preferences.windows = nativeSettings(preferences.windows);
      if (preferences.endpoint) backend.origin = endpoint(preferences.endpoint).origin;
    } catch { preferences = {}; }
    if (launchMode === 'windows' || launchMode === 'wsl') {
      preferences.connectionMode = launchMode;
      const name = launchMode === 'windows' ? 'windows' : 'wsl';
      preferences[name] = { ...(preferences[name] || {}), autoConnect: true };
    }
    nativeTheme.themeSource = ['light', 'dark'].includes(preferences.theme) ? preferences.theme : 'system';
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    const root = path.resolve(__dirname, '../dist');
    protocol.handle('selark', async request => {
      const url = new URL(request.url);
      let file;
      try { file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)); } catch { return new Response('', { status: 400 }); }
      if (url.host !== 'app' || !file.startsWith(root + path.sep) || !['.html', '.js', '.css', '.svg', '.png', '.woff2'].includes(path.extname(file))) return new Response('', { status: 403 });
      const response = await net.fetch(pathToFileURL(file).href);
      response.headers.set('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
      response.headers.set('X-Content-Type-Options', 'nosniff');
      return response;
    });
    handle('desktop:config', config);
    handle('desktop:wsl-list', () => listDistributions());
    handle('desktop:wsl-start', input => connectWorkspace('wsl', input));
    handle('desktop:native-start', input => connectWorkspace('windows', input));
    handle('desktop:wsl-cancel', cancelConnection);
    handle('desktop:connect', link => connectWorkspace('manual', link));
    handle('desktop:disconnect', cancelConnection);
    handle('desktop:clear-session', () => backend.disconnect());
    handle('desktop:probe', address => backend.probe(address));
    handle('desktop:request', input => backend.request(input));
    handle('desktop:copy', text => { if (typeof text !== 'string' || text.length > 4096) throw new Error('文本过长。'); clipboard.writeText(text); });
    ipcMain.on('desktop:theme', (event, preference) => {
      if (!trusted(event) || !['light', 'dark', 'system'].includes(preference)) return;
      if (nativeTheme.themeSource !== preference) nativeTheme.themeSource = preference;
      updateWindowTheme();
      if (preferences.theme !== preference) { preferences.theme = preference; void persist().catch(() => {}); }
    });
    ipcMain.on('desktop:cancel', (event, id) => { if (trusted(event) && typeof id === 'string') backend.cancel(id); });
    ipcMain.on('desktop:window', (event, action) => {
      if (!trusted(event)) return;
      if (action === 'minimize') window.minimize();
      if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize();
      if (action === 'close') window.close();
    });
    window = new BrowserWindow({
      width: Math.max(960, Math.min(2400, Number(preferences.width) || 1360)),
      height: Math.max(640, Math.min(1600, Number(preferences.height) || 900)),
      minWidth: 960, minHeight: 640, show: false,
      titleBarStyle: 'hidden', titleBarOverlay: { color: '#00000000', symbolColor: nativeTheme.shouldUseDarkColors ? '#eeeeee' : '#242424', height: 48 },
      title: 'Selark', backgroundColor: nativeTheme.shouldUseDarkColors ? '#202020' : '#f3f3f3', icon: path.join(__dirname, '../build/icon.ico'),
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: true, spellcheck: false },
    });
    nativeTheme.on('updated', updateWindowTheme);
    window.once('closed', () => nativeTheme.removeListener('updated', updateWindowTheme));
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    for (const event of ['minimize', 'hide']) window.on(event, () => window.webContents.send('desktop:visibility', false));
    for (const event of ['restore', 'show']) window.on(event, () => window.webContents.send('desktop:visibility', true));
    window.once('ready-to-show', () => { if (preferences.maximized) window.maximize(); window.show(); });
    window.on('close', () => {
      const bounds = window.getNormalBounds();
      preferences = { ...preferences, endpoint: backend.origin, width: bounds.width, height: bounds.height, maximized: window.isMaximized() };
      backend.close();
    });
    await window.loadURL('selark://app/');
  }).catch(() => { dialog.showErrorBox('Selark 无法启动', '本地应用资源无法加载，请重新安装 Selark。'); app.quit(); });
  app.on('window-all-closed', finishQuit);
  app.on('before-quit', event => { if (!quitting) { event.preventDefault(); finishQuit(); } });
}
