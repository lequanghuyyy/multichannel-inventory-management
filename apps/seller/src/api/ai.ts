import { createApiClient } from './client';
import { ApiRequestError, parseApiError } from '../core/api-error';

/**
 * What the core recorded. Every field is a stored fact read from a row the rest of the API
 * wrote — `category` comes from products.category and is never parsed out of a SKU.
 */
export type AiObservation = {
  variant_id: string;
  sku: string;
  category: string;
  on_hand: number;
  reserved: number;
  safety_buffer: number;
  units_sold: number;
  priced_lines: number;
};

/**
 * Advice for a person, never applied automatically. The default is 0: a buffer costs more lost sales than it
 * saves unless sync is slow and an oversell is very expensive (docs/ai/buffer/RESULTS.md).
 */
export type AiBufferSuggestion = {
  units: number;
  cap_units: number;
  source: 'dynamic' | 'disabled' | 'no_forecast' | 'forecast_invalid' | 'forecast_stale' | 'no_stock' | 'bad_input';
  reason: string;
  valid_until: string;
};

/** A forecast the output guard refused, with the reason. */
export type AiRejection = { sku: string; reason: string };

/** A SKU the provider declined to forecast. */
export type AiOmission = { sku: string; reason: string };

/** The provider's claim. Absent whenever `ready` is false — never a zero-filled stand-in. */
export type AiForecast = {
  variant_id: string;
  sku: string;
  horizon_days: number;
  expected_units: number;
  lower_units: number;
  upper_units: number;
  /** Hosted models: their stated confidence. The local service: nominal coverage of [lower, upper], not a probability of being right. */
  confidence: number;
  rationale: string;
  method?: string;
  /** 95th-percentile demand over the horizon, when the provider gives one. */
  q95_units?: number;
  buffer_suggestion?: AiBufferSuggestion;
};

export type AiRecommendation = {
  horizon_days: number;
  window_days: number;
  /** Empty when `ready` is false. */
  provider: string;
  model: string;
  /** True only when a provider answered this request. */
  ready: boolean;
  reason?: 'no_ai_provider_configured';
  generated_at: string;
  source: 'core-database';
  category_options: string[];
  observations: AiObservation[];
  /** Empty whenever `ready` is false. */
  forecasts: AiForecast[];
  model_version?: string;
  /** Audit row for this request; absent when the audit write failed. */
  run_id?: string;
  as_of?: string;
  /** Set when the primary provider failed and a fallback answered. */
  fallback_from?: string;
  simulated_training_data?: boolean;
  /** Forecasts the output guard refused. Optional so an older API response still parses. */
  rejected?: AiRejection[];
  omitted?: AiOmission[];
};

export interface AiQuery {
  category?: string;
  horizon_days?: number;
}

export async function getAiRecommendations(query: AiQuery = {}, signal?: AbortSignal): Promise<AiRecommendation> {
  const client = createApiClient();
  const params = {
    ...(query.category ? { category: query.category } : {}),
    ...(query.horizon_days ? { horizon_days: query.horizon_days } : {}),
  };
  const { data, error, response } = await client.GET('/api/v1/ai/recommendations', {
    params: { query: params }, signal, cache: 'no-store',
  });
  if (!response.ok) {
    // A 502 here means the provider WAS reached and failed. That is surfaced as an error
    // rather than returned as an empty forecast list, because a caller that cannot tell an
    // outage from a quiet week will act on the outage as if it were the week.
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không kết nối được dự báo. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu dự báo nhận về không hợp lệ.');
  return data as unknown as AiRecommendation;
}

export type AiFeatureKey = 'demand_forecast' | 'replenishment' | 'price_review';

export type AiFeatureConfig = {
  key: AiFeatureKey;
  label: string;
  /** Empty when `ready` is false. */
  provider: string;
  /** Empty when `ready` is false. */
  model: string;
  /** True only when credentials for this feature are configured. */
  ready: boolean;
  reason?: 'no_ai_provider_configured';
  /** Models this deployment could actually call. Empty rather than guessed. */
  candidates: string[];
};

export type AiFeatureRegistry = {
  source: 'process-environment';
  features: AiFeatureConfig[];
};

/**
 * Reads the per-feature model registry from the Go API.
 *
 * Separate from the forecast because it has to be answerable when there is no forecast to
 * read: the screen needs this state precisely in the case where predictions are unavailable.
 */
export async function getAiFeatures(signal?: AbortSignal): Promise<AiFeatureRegistry> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/ai/features', { signal, cache: 'no-store' });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không kết nối được danh sách mô hình AI. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu danh sách mô hình AI nhận về không hợp lệ.');
  return data as unknown as AiFeatureRegistry;
}

/** A feature that pushed a window over the threshold. */
export type AiExplanation = { feature: string; value?: number; robust_z?: number; rule_threshold?: number };

export type AiWindowScore = {
  end: string;
  /** A ranking score, not a probability. */
  score: number;
  over_threshold: boolean;
  /** True after two consecutive scored windows over the threshold. */
  alarm: boolean;
  explanation: AiExplanation[];
};

export type AiChannelHealth = {
  code: string;
  name: string;
  type: string;
  environment: string;
  status: 'alarm' | 'watch' | 'ok' | 'idle';
  active_windows: number;
  idle_windows: number;
  peak_score: number;
  latest?: AiWindowScore;
  series: AiWindowScore[];
};

export type AiSyncHealth = {
  /** True only when a monitor answered. */
  ready: boolean;
  reason?: 'no_sync_monitor_configured';
  generated_at: string;
  minutes: number;
  window_seconds: number;
  model?: string;
  version?: string;
  threshold?: number;
  /** True when the monitor was trained on simulated logs. */
  simulated_training_data: boolean;
  channels: AiChannelHealth[];
};

/**
 * Reads the Sync Health Monitor's verdict per channel. Read-only on the server: an alarm is information for
 * a person and never retries, pauses or rewrites anything.
 */
export async function getAiSyncHealth(minutes = 30, signal?: AbortSignal): Promise<AiSyncHealth> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/ai/sync-health', {
    params: { query: { minutes } }, signal, cache: 'no-store',
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không kết nối được dịch vụ giám sát đồng bộ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu giám sát đồng bộ nhận về không hợp lệ.');
  return data as unknown as AiSyncHealth;
}
