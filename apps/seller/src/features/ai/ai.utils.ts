import type { Recommendation, RecommendationFilters, RecommendationStatus } from './ai.types';

export const initialRecommendationFilters: RecommendationFilters = { query: '', status: 'all', kind: 'all' };

export const recommendationPresentation: Record<RecommendationStatus, { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }> = {
  review_required: { label: 'Cần xem xét', tone: 'warning' },
  ready: { label: 'Xem trước chính sách', tone: 'neutral' },
  stable: { label: 'Ổn định', tone: 'success' },
  unavailable: { label: 'Không khả dụng', tone: 'danger' },
};

export function filterRecommendations(items: Recommendation[], filters: RecommendationFilters): Recommendation[] {
  const query = filters.query.trim().toLocaleLowerCase('vi');
  return items.filter((item) => (!query || [item.title, item.module, item.scope.id, item.scope.label, item.model.name].some((value) => value.toLocaleLowerCase('vi').includes(query)))
    && (filters.status === 'all' || item.status === filters.status)
    && (filters.kind === 'all' || item.kind === filters.kind));
}

export function formatAIEventTime(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value));
}
