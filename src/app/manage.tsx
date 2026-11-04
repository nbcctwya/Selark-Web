import { createContext, useContext } from 'react';
import type { Capabilities, DashboardApi, Snapshot } from '../api/types';
import type { WriteOptions, WriteResult } from '../hooks/useDashboard';

export interface Manage {
  api: DashboardApi;
  read: <T>(operation: (signal: AbortSignal) => Promise<T>, signal: AbortSignal) => Promise<T>;
  run: <T>(operation: (signal: AbortSignal) => Promise<T>, options: WriteOptions) => Promise<WriteResult<T> | null>;
  saving: string | null;
  can: Capabilities;
  /** Why an operation is closed, for disabled-state hints. */
  why: Record<keyof Capabilities, string>;
}

const closed: Capabilities = { connection_management: false, model_approval: false, model_discovery: false, application_management: false };
export const ManageContext = createContext<Manage | null>(null);
export function useManage(): Manage {
  const value = useContext(ManageContext);
  if (!value) throw new Error('ManageContext missing');
  return value;
}

/** Combines GET /api/capabilities with the snapshot's legacy model switch. Unreadable capabilities close every entry. */
export function resolveCapabilities(capabilities: Capabilities | null, snapshot: Snapshot | null): Pick<Manage, 'can' | 'why'> {
  const can = capabilities ? { ...capabilities, model_approval: capabilities.model_approval && Boolean(snapshot?.capabilities.model_approval) } : closed;
  const allOff = capabilities && !capabilities.connection_management && !capabilities.application_management && !capabilities.model_approval;
  const base = !capabilities ? '操作开关暂不可读，管理入口已关闭；请刷新重试。' : allOff ? '只读模式：此 Dashboard 关闭了全部管理写入。' : '当前启动模式不允许此操作。';
  return {
    can,
    why: {
      connection_management: base,
      model_approval: base,
      application_management: base,
      model_discovery: capabilities && !allOff && !capabilities.model_discovery ? '离线模式关闭了模型发现；本地管理仍可使用。' : base,
    },
  };
}
