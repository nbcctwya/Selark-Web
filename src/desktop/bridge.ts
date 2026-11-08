import { createHttpApi } from '../api/http';

export interface WslSettings { distribution: string; executable: string; configDir: string; autoConnect: boolean; readOnly?: boolean }
export interface NativeSettings { configDir: string; initialPort: number; autoConnect: boolean; readOnly: boolean; keepRunning: boolean }
export interface NativeInfo { gatewayPid: number; gatewayUrl: string; ownsGateway: boolean; configDir: string; dataDir: string }
export interface DesktopConfig { endpoint: string; connected: boolean; version?: string; visible?: boolean; connectionMode?: 'windows' | 'wsl' | 'manual' | null; wsl?: WslSettings; windows?: NativeSettings; nativeInfo?: NativeInfo | null; nativeConfigDir?: string; chooseBackend?: boolean }
export interface DesktopBridge {
  config(): Promise<DesktopConfig>;
  connect(link: string): Promise<DesktopConfig>;
  disconnect(): Promise<void>;
  clearSession(): Promise<void>;
  listWsl(): Promise<string[]>;
  startWsl(settings?: WslSettings): Promise<DesktopConfig>;
  startNative(settings?: NativeSettings): Promise<DesktopConfig>;
  cancelWsl(): Promise<void>;
  probe(address: string): Promise<{ reachable: boolean; endpoint: string }>;
  request(input: { id: string; path: string; method: string; body?: unknown }): Promise<{ status: number; body: unknown }>;
  cancel(id: string): void;
  copyText(text: string): Promise<void>;
  onVisibility(callback: (visible: boolean) => void): () => void;
  theme(preference: 'light' | 'dark' | 'system'): void;
  onChooseBackend(callback: (mode: 'windows' | 'wsl' | 'choose') => void): () => void;
  window(action: 'minimize' | 'maximize' | 'close'): void;
}
declare global { interface Window { selark?: DesktopBridge } }

export function createDesktopApi(bridge: DesktopBridge) {
  return createHttpApi({
    onClearSession: () => { void bridge.clearSession(); },
    async transport(path, method, body, signal) {
      signal?.throwIfAborted();
      const id = crypto.randomUUID();
      const cancel = () => bridge.cancel(id);
      signal?.addEventListener('abort', cancel, { once: true });
      try {
        const response = await bridge.request({ id, path, method, body });
        signal?.throwIfAborted();
        return response;
      } catch (error) {
        signal?.throwIfAborted();
        throw error;
      } finally { signal?.removeEventListener('abort', cancel); }
    },
  });
}
