/** Selark Dashboard v1 wire contract. Monetary amounts are decimal strings. */
export type ResourceType = 'api' | 'token_plan' | 'chatgpt_subscription';
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
export interface Policy {
  allow_token_plans: boolean;
  allow_chatgpt_subscriptions: boolean;
  chatgpt_output_reservation: number | null;
  allowed_connections: string[] | null;
  allowed_models: string[] | null;
  requests_per_minute: number | null;
  max_concurrent_requests: number | null;
  max_output_tokens: number | null;
  max_estimated_input_tokens: number | null;
  daily_token_limit: number | null;
  daily_budget: string | null;
  budget_currency: string;
}
export interface Quota {
  day: string;
  timezone: string;
  policy: Policy;
  requests: number;
  in_flight_requests: number;
  uncertain_requests: number;
  remaining_tokens: number | null;
  token_quota_state: 'unlimited' | 'limited' | 'exhausted' | 'blocked_unknown_usage';
  historical_requests_excluded: number;
  charged_or_reserved_tokens: number;
  unknown_token_requests: number;
  estimated_reserved_tokens: number;
  estimated_cost_or_reservation: Record<string, string>;
  unknown_cost_requests: number;
  billed_cost: null;
  scope: string;
}
export interface Application {
  id: string;
  name: string;
  created_at: string;
  revoked_at: string | null;
  active: boolean;
  policy: Policy;
  quota: Quota;
  effective_resources: { id: string; name: string; resource_type: ResourceType; models: string[] }[];
}
export interface Verification {
  state: string;
  previous_state?: string;
  verified_at?: string | null;
  age_seconds?: number | null;
  model?: string | null;
  scope?: string;
  outcome?: string;
  request_id?: string;
  actual_model?: string | null;
  protocol?: string;
  capability?: string;
  current_configuration?: boolean;
  account_access_observed?: string;
  live_availability?: string;
}
export interface CatalogModel {
  id: string;
  discovery: string;
  approved: boolean;
  default: boolean;
  authorized_applications: string[];
  effective_applications: string[];
  verified_capabilities: string[];
  live_availability: string;
  verification: Verification[];
}
export interface Connection {
  id: string;
  name: string;
  provider: string;
  resource_type: ResourceType;
  enabled: boolean;
  models: string[];
  default_model: string | null;
  client_allowed_models: string[];
  authorization: {
    kind: string;
    state?: string;
    credential_configured?: boolean;
    remote_validity?: string;
    access_expired?: boolean | null;
    expires_at?: string | null;
    refresh_available?: boolean;
    refresh_state?: string;
    plan_permission?: boolean;
    ready?: boolean;
  };
  verification: Verification;
  availability: { state: string; checked_live: boolean; blockers: string[] };
  discovery: { state: string; checked_at: string | null; discovered_at: string | null; current: boolean; count: number };
  model_catalog: {
    counts: { discovered: number; approved: number; application_authorized: number; historically_verified: number };
    protocol: string | null;
    approval_revision: number;
    models: CatalogModel[];
  };
  provider_quota: {
    state: string;
    remaining_tokens?: number | null;
    current_remaining_tokens?: number | null;
    historical_snapshot?: boolean;
    checked_at?: string | null;
    age_seconds?: number | null;
    extra_usage?: string;
    membership_status?: string;
    conflicting_fields?: string[];
    invalid_fields?: string[];
    windows: { name: string; used_ratio: number | null; reset_at: string | null }[];
    reported_counters: { window: string; unit: string; limit: number | null; used: number | null; remaining: number | null; reset_at: string | null }[];
  };
}
export interface UsageSummary {
  requests: number;
  known_usage_requests: number;
  missing_usage_requests: number;
  local_rejected_requests: number;
  unknown_consumption_requests: number;
  in_flight_requests: number;
  reported_usage_requests: number;
  upstream_attempts: number;
  unknown_attempt_count_requests: number;
  unknown_time_requests: number;
  status_counts: Record<string, number>;
  known_tokens: { prompt_tokens: number | null; completion_tokens: number | null; total_tokens: number | null };
  missing_field_requests: Record<string, number>;
  estimated_cost_by_currency: Record<string, string>;
  unknown_cost_requests: number;
  billed_cost: null;
  resource_accounting: { scope: string; requests: number; tokens_by_basis: Record<string, number> };
  average_latency_ms?: number | null;
  latency_samples?: number;
  completed_requests?: number;
  success_rate?: number | null;
}
export interface TrendPoint {
  day: string;
  requests: number;
  known_tokens: { total_tokens: number | null; prompt_tokens?: number | null; completion_tokens?: number | null };
  estimated_cost_by_currency: Record<string, string>;
  unknown_consumption_requests: number;
  success_rate: number | null;
  average_latency_ms: number | null;
}
export interface Usage {
  timezone: string;
  filters: Filters & { since: string; until: string };
  summary: UsageSummary;
  group_by: string;
  trend: TrendPoint[];
  models: (UsageSummary & { connection_id: string; model: string })[];
  unknown_time_excluded: number;
}
export interface Service {
  state: string;
  reachable: boolean | null;
  version?: string;
  version_matches?: boolean;
  pid?: number;
  capacity?: { active?: number; queued?: number; admitted?: number; max_active?: number; max_queued?: number; accepting?: boolean };
  storage?: { degraded?: boolean; pending_records?: number; invalid_records?: number; accepting?: boolean };
}
export interface Snapshot {
  checked_at: string;
  version: string;
  scope: string;
  ok: boolean;
  issues: string[];
  connections: Connection[];
  applications: Application[];
  service: Service;
  usage: Usage | null;
  options: { models: string[]; connections: string[] };
  limits?: Record<string, number>;
  capabilities: { model_approval: boolean };
}
export interface RequestRecord {
  request_id: string;
  started_at: string | null;
  finished_at: string | null;
  caller_id: string | null;
  connection_id: string | null;
  model: string | null;
  resource_type: ResourceType | null;
  purpose: string;
  status: string;
  http_status: number | null;
  upstream_status: number | null;
  duration_ms: number | null;
  queue_ms: number | null;
  upstream_attempts: number | null;
  upstream_result: string | null;
  delivery_status: string | null;
  error_code: string | null;
  upstream_error_code: string | null;
  delivery_error_code: string | null;
  usage_final: boolean;
  usage_known: boolean;
  usage_consistency: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  origin: string;
  cost: { estimated_cost?: string | null; currency?: string | null; cost_status?: string; token_basis?: string };
}
export interface RecordsPage { items: RequestRecord[]; total: number; offset: number; limit: number }
export interface Logs {
  items: { timestamp: string; path: string; status?: number; duration_ms?: number; queue_ms?: number; upstream_attempts?: number }[];
  omitted: number;
  window: number;
}
export interface Backups {
  items: { name: string; integrity: string; created_at: string | null; manifest: string }[];
  total: number;
  limit: number;
}
export interface ModelApproval {
  connection_id: string;
  model: string;
  enabled: boolean;
  revision: number;
  clear_default?: boolean;
}
export interface ModelApprovalResult { connection_id: string; model: string; enabled: boolean; default_model: string | null }

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
}
