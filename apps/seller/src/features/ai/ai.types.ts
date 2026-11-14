export type RecommendationStatus = 'review_required' | 'ready' | 'stable' | 'unavailable';
export type RecommendationKind = 'safety_buffer' | 'sync_anomaly' | 'demand_forecast' | 'burst_protection';

export interface ModelReference {
  name: string;
  version: string;
  execution: 'local' | 'external' | 'deterministic';
  fallback: string;
}

export interface RecommendationScore {
  label: string;
  displayValue: string;
  semantics: 'model_score' | 'anomaly_score' | 'rule_signal';
  calibrated: boolean;
  threshold?: string;
}

export interface RecommendationComparison {
  label: string;
  current: string;
  suggested: string;
  impact: string;
}

export interface Recommendation {
  id: string;
  kind: RecommendationKind;
  module: string;
  title: string;
  summary: string;
  reason: string;
  status: RecommendationStatus;
  scope: { type: 'sku' | 'gateway'; id: string; label: string };
  model: ModelReference;
  score?: RecommendationScore;
  comparisons: RecommendationComparison[];
  evidence: string[];
  evaluatedAt: string;
  expiresAt?: string;
  provenance: 'fixture';
  capabilities: { canApply: false; canDismiss: false; canAcknowledge: false };
}

export interface AIModelFixture {
  id: string;
  feature: string;
  model: string;
  type: 'local' | 'external' | 'deterministic';
  version: string;
  state: 'healthy_fixture' | 'fallback_fixture' | 'calibrated_fixture';
  fallback: string;
  updatedAt: string;
}

export interface RecommendationFilters {
  query: string;
  status: 'all' | RecommendationStatus;
  kind: 'all' | RecommendationKind;
}
