export type MetricTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface Metric {
  id: string;
  label: string;
  value: string;
  detail?: string;
  icon?: string;
  tone?: MetricTone;
}
