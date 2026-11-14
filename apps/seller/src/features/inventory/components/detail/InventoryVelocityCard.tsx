import { Card } from '../../../../components/ui/Card';

export function InventoryVelocityCard() {
  return (
    <Card className="flex items-start gap-3 border border-outline-variant/70 p-4 sm:p-5">
      <span className="material-symbols-outlined mt-0.5 text-graphite" aria-hidden="true">query_stats</span>
      <div><h2 className="font-display text-base font-bold text-on-surface">Tốc độ bán</h2><p className="mt-1 font-body text-body-sm text-graphite">Chưa đủ dữ liệu để tính tốc độ bán.</p></div>
    </Card>
  );
}
