import { useCallback } from 'react';
import { navigate } from '../../app/routes';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/ScreenState';
import { Button } from '../../components/ui/Button';
import { getRecommendation, type DemoMode } from '../../mocks/mock-api';
import { useMockData } from '../shared/useMockData';
import { AIGuardrail } from './components/AIGuardrail';
import { RecommendationDetailPanel } from './components/RecommendationDetailPanel';

export function RecommendationDetailPage({ id, mode }: { id: string; mode: DemoMode }) {
  const loadRecommendation = useCallback((currentMode: DemoMode) => getRecommendation(id, currentMode), [id]);
  const { value: recommendation, error, loading, refresh } = useMockData(loadRecommendation, mode);
  return <section className="mx-auto flex w-full max-w-[1000px] flex-col gap-6 py-8"><Button variant="ghost" onClick={() => navigate('/ai')} className="self-start">← Trợ lý AI</Button><div><span className="font-body text-caption font-semibold uppercase tracking-[0.16em] text-graphite">Trợ lý AI / chi tiết đề xuất</span><h1 className="mt-2 font-display text-[clamp(2rem,5vw,3rem)] font-bold tracking-tight text-on-surface">{recommendation?.title ?? 'Chi tiết đề xuất'}</h1><p className="mt-2 font-body text-body-sm text-graphite">Chỉ để xem; không thay đổi tồn kho hay chính sách.</p></div><AIGuardrail />{loading ? <LoadingState /> : error ? <ErrorState error={error} retry={refresh} /> : !recommendation ? <EmptyState title="Không tìm thấy đề xuất" detail="Không có đề xuất này trong dữ liệu mẫu." /> : <RecommendationDetailPanel recommendation={recommendation} />}</section>;
}
