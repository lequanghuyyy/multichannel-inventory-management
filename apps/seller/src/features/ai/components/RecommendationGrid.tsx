import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import type { Recommendation } from '../ai.types';
import { formatAIEventTime, recommendationPresentation } from '../ai.utils';

function RecommendationCard({ item, onOpen }: { item: Recommendation; onOpen: () => void }) {
  const status = recommendationPresentation[item.status];
  return <Card className="flex min-h-[330px] flex-col gap-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><span className="font-body text-caption font-semibold uppercase tracking-wider text-graphite">{item.module}</span><h2 className="mt-1 font-display text-xl font-bold leading-7 text-on-surface">{item.title}</h2></div><StatusBadge tone={status.tone}>{status.label}</StatusBadge></div><div className="rounded-control bg-surface-container-low p-3"><span className="font-body text-caption text-graphite">Đối tượng</span><code className="mt-1 block break-all font-mono text-body-sm font-semibold text-on-surface">{item.scope.id}</code><p className="mt-1 font-body text-caption text-graphite">{item.scope.label}</p></div><p className="font-body text-body-sm leading-5 text-on-surface-variant">{item.summary}</p>{item.score ? <div className="flex items-end justify-between gap-3"><span><span className="block font-body text-caption text-graphite">{item.score.label}</span><strong className="font-display text-2xl text-on-surface">{item.score.displayValue}</strong></span><span className="text-right font-body text-caption text-graphite">{item.score.calibrated ? 'Đã hiệu chuẩn' : 'Không phải xác suất'}{item.score.threshold ? <span className="block">Ngưỡng {item.score.threshold}</span> : null}</span></div> : null}<div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/50 pt-4"><span className="font-body text-caption text-graphite">{item.model.name} · {item.model.version}<span className="block">{formatAIEventTime(item.evaluatedAt)}</span></span><Button size="sm" onClick={onOpen}>Xem chi tiết <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_forward</span></Button></div></Card>;
}

export function RecommendationGrid({ items, onOpen }: { items: Recommendation[]; onOpen: (id: string) => void }) {
  return <section className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-label="Danh sách đề xuất AI">{items.map((item) => <RecommendationCard key={item.id} item={item} onOpen={() => onOpen(item.id)} />)}</section>;
}
