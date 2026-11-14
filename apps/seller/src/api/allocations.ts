import { ApiRequestError, parseApiError } from '../core/api-error';
import { apiFetch } from './client';

/**
 * Multi-channel inventory allocation.
 *
 * Preview persists a `projected` plan only. Nothing is written to a marketplace until the
 * administrator confirms execution, and every channel quantity is chosen by the server's
 * Allocation Orchestrator. The client never sends a per-listing quantity.
 */
export type AllocationPolicyType = 'equal' | 'weighted' | string;
export type AllocationPlanStatus = 'projected' | 'applying' | 'paused' | 'blocked' | 'completed' | 'superseded' | string;
export type AllocationExecutionPhase =
  | 'checking_conditions'
  | 'decreasing'
  | 'verifying_decreases'
  | 'increasing'
  | 'verifying_increases'
  | 'final_verification'
  | 'completed'
  | 'paused_data_changed'
  | 'blocked'
  | string;
export type AllocationStepStatus = 'pending' | 'in_progress' | 'awaiting_verification' | 'verified' | 'superseded' | string;
export type AllocationDirection = 'decrease' | 'increase' | 'unchanged' | string;
export type POSMode = 'shared' | 'dedicated';

export interface AllocationPolicySnapshot {
  type: AllocationPolicyType;
  weights: Record<string, number>;
}

export interface AllocationPlanItem {
  listing_id: string;
  channel_id: string;
  channel_code: string;
  external_sku: string;
  current_allocation_state: string;
  planned_state: 'continuing' | 'joining' | 'leaving' | 'excluded' | string;
  currently_participating: boolean;
  will_participate: boolean;
  platform_product_exists: boolean;
  published: boolean;
  publication_state: string;
  inventory_tracking_ready: boolean;
  inventory_write_enabled: boolean;
  mapping_verified: boolean;
  ready_to_sell: boolean;
  current_target_quantity: number | null;
  target_allocation_revision: number;
  reported_quantity: number | null;
  reported_at?: string;
  proposed_quantity: number;
  delta: number | null;
  delta_basis: 'target' | 'reported' | 'unknown' | string;
  change: 'increase' | 'decrease' | 'unchanged' | 'unknown' | string;
  can_execute: boolean;
  issues: string[];
}

export interface AllocationPlanPreview {
  id: string;
  variant_id: string;
  sku: string;
  available_to_sell: number;
  pos_mode?: POSMode;
  desired_pos_mode?: POSMode;
  desired_pos_quota?: number;
  active_pos_quota?: number;
  pos_remaining?: number;
  current_pos_transition_state?: 'stable' | 'pending';
  planned_pos_transition_state?: 'stable' | 'pending';
  pos_quota_requested?: boolean;
  pos_revision?: number;
  planned_pos_remaining?: number;
  online_budget?: number;
  unallocated?: number;
  core_version: number;
  base_allocation_revision: number;
  allocation_revision: number;
  policy: AllocationPolicySnapshot;
  status: AllocationPlanStatus;
  can_execute: boolean;
  issues: string[];
  items: AllocationPlanItem[];
  created_at: string;
}

export interface AllocationExecutionStep {
  id: string;
  listing_id: string;
  channel_code: string;
  direction: AllocationDirection;
  status: AllocationStepStatus;
  before_quantity: number;
  target_quantity: number;
  observed_quantity?: number | null;
  final_observed_quantity?: number | null;
  attempt_count: number;
  last_error?: string;
  final_verification_error?: string;
  evidence: unknown;
  started_at?: string;
  verified_at?: string;
  final_verified_at?: string;
}

export interface AllocationExecution {
  plan_id: string;
  variant_id: string;
  core_version: number;
  base_allocation_revision: number;
  allocation_revision: number;
  status: AllocationPlanStatus;
  phase: AllocationExecutionPhase;
  can_execute: boolean;
  last_error?: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  steps: AllocationExecutionStep[];
}

export interface AllocationPreviewInput {
  variant_id: string;
  listing_ids: string[];
  pos_revision?: number;
  desired_pos_mode?: POSMode;
  desired_pos_quota?: number;
  /** Omit to use the saved policy. `{}` explicitly asks for equal shares. */
  weights?: Record<string, number>;
}

function errorFromBody(body: unknown, status: number): never {
  if (body && typeof body === 'object') {
    try {
      throw new ApiRequestError(parseApiError(body), status);
    } catch (error) {
      if (error instanceof ApiRequestError) throw error;
    }
  }
  throw new Error(status >= 500 ? 'Máy chủ chưa thể xử lý phân bổ. Hãy thử lại sau.' : 'Yêu cầu phân bổ chưa hợp lệ.');
}

async function readBody<T>(response: Response, fallback: string): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  if (!response.ok) errorFromBody(body, response.status);
  if (!body) throw new Error(fallback);
  return body as T;
}

export async function previewAllocation(input: AllocationPreviewInput, signal?: AbortSignal): Promise<AllocationPlanPreview> {
  const response = await apiFetch('/api/v1/inventory/allocations/preview', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  return readBody<AllocationPlanPreview>(response, 'Máy chủ không trả về kế hoạch phân bổ dự kiến.');
}

export async function getAllocationExecution(planId: string, signal?: AbortSignal): Promise<AllocationExecution> {
  const response = await apiFetch(`/api/v1/inventory/allocations/${encodeURIComponent(planId)}`, {
    cache: 'no-store',
    signal,
  });
  return readBody<AllocationExecution>(response, 'Máy chủ không trả về tiến trình phân bổ.');
}

export async function executeAllocation(planId: string): Promise<AllocationExecution> {
  const response = await apiFetch(`/api/v1/inventory/allocations/${encodeURIComponent(planId)}/execute`, {
    method: 'POST',
    cache: 'no-store',
  });
  return readBody<AllocationExecution>(response, 'Máy chủ không trả về trạng thái thực thi phân bổ.');
}
