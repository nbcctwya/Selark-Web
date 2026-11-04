/** Public wire types generated from the backend-owned OpenAPI contract. */
import type { components } from './generated';
type Schema = components['schemas'];
export type ResourceType = Schema['ManagedConnection']['resource_type'];
export type Period = '24h' | '7d' | '30d' | '90d' | 'custom';
export interface Filters {
  period?: Period;
  since?: string;
  until?: string;
  caller_id?: string;
  connection_id?: string;
  model?: string;
}
export interface RecordQuery extends Filters { offset?: number; errors?: boolean }
export type Policy = Schema['PolicyView'];
export type Quota = Schema['Quota'];
export type Application = Schema['Application'];
export type Verification = Schema['Verification'];
export type CatalogModel = Schema['CatalogModel'];
export type Connection = Schema['Connection'];
export type UsageSummary = Schema['UsageSummary'];
export type Usage = Schema['Usage'];
export type Service = Schema['Service'];
export type Snapshot = Schema['Snapshot'];
export type RequestRecord = Schema['RequestRecord'];
export type RecordsPage = Schema['RecordsPage'];
export type Logs = Schema['Logs'];
export type Backups = Schema['Backups'];
export type ModelApprovalResult = Schema['ModelApprovalResult'];
export type Capabilities = Schema['Capabilities'];
export type Provider = Schema['Provider'];
export type ManagedConnection = Schema['ManagedConnection'];
export type ManagedModels = Schema['ManagedModels'];
export type ManagedApplication = Schema['ManagedApplication'];
export type CreatedApplication = Schema['CreatedApplication'];
export type RevokedApplication = Schema['RevokedApplication'];
export type ApplicationQuota = Schema['ApplicationQuota'];
export type ConnectionCreate = Schema['ConnectionCreate'];
export type ConnectionPatch = Schema['ConnectionPatch'];
export type DefaultModel = Schema['DefaultModel'];
export type ApplicationCreate = Schema['ApplicationCreate'];
export type ApplicationPolicy = Schema['ApplicationPolicy'];
export type ApplicationRevoke = Schema['ApplicationRevoke'];
export type ModelApproval = Schema['LegacyModelApproval'];
export type BatchModelApproval = Schema['ModelApproval'];
export type TrendPoint = Usage['trend'][number];

/** Views depend only on this interface, never on fetch, fixtures or private config. */
export interface DashboardApi {
  readonly kind: 'http' | 'mock';
  initialize(bootstrap?: string | null): Promise<void>;
  clearSession(): void;
  snapshot(filters?: Filters, signal?: AbortSignal): Promise<Snapshot>;
  records(filters?: RecordQuery, signal?: AbortSignal): Promise<RecordsPage>;
  logs(signal?: AbortSignal): Promise<Logs>;
  backups(signal?: AbortSignal): Promise<Backups>;
  setModelApproval(change: ModelApproval, signal?: AbortSignal): Promise<ModelApprovalResult>;
  getCapabilities(signal?: AbortSignal): Promise<Capabilities>;
  getProviders(signal?: AbortSignal): Promise<{ items: Provider[] }>;
  getConnections(signal?: AbortSignal): Promise<{ items: ManagedConnection[] }>;
  getConnection(id: string, signal?: AbortSignal): Promise<ManagedConnection>;
  createConnection(input: ConnectionCreate, signal?: AbortSignal): Promise<ManagedConnection>;
  updateConnection(id: string, input: ConnectionPatch, signal?: AbortSignal): Promise<ManagedConnection>;
  getConnectionModels(id: string, signal?: AbortSignal): Promise<ManagedModels>;
  discoverModels(id: string, signal?: AbortSignal): Promise<ManagedModels>;
  approveModels(id: string, input: BatchModelApproval, signal?: AbortSignal): Promise<ManagedModels>;
  setDefaultModel(id: string, input: DefaultModel, signal?: AbortSignal): Promise<ManagedModels>;
  getApplications(signal?: AbortSignal): Promise<{ items: ManagedApplication[] }>;
  getApplication(id: string, signal?: AbortSignal): Promise<ManagedApplication>;
  createApplication(input: ApplicationCreate, signal?: AbortSignal): Promise<CreatedApplication>;
  updateApplicationPolicy(id: string, input: ApplicationPolicy, signal?: AbortSignal): Promise<ManagedApplication>;
  revokeApplication(id: string, input: ApplicationRevoke, signal?: AbortSignal): Promise<RevokedApplication>;
  getApplicationQuota(id: string, signal?: AbortSignal): Promise<ApplicationQuota>;
}
