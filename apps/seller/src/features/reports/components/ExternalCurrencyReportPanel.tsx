import { Card } from '../../../components/ui/Card';
import type { ReportSummary } from '../../../api/reports';

const sourceName: Record<string,string> = { webhook:'Webhook',polling:'Polling',simulator:'Simulator' };

export function ExternalCurrencyReportPanel({ values }: { values: ReportSummary['external_currency_values'] }) {
  return <Card className="grid gap-4 p-5" aria-label="Giá trị marketplace theo loại tiền">
    <div><h2 className="font-display text-lg font-bold text-on-surface">Giá trị marketplace theo currency</h2><p className="mt-1 font-body text-caption text-graphite">Tổng marketplace và payment evidence được tách theo loại tiền và nguồn. Payment evidence chưa đồng nghĩa với settlement.</p></div>
    {values.length===0?<p className="rounded-control bg-surface-container-low p-3 font-body text-caption text-graphite">Chưa có snapshot thương mại marketplace trong khoảng thời gian và bộ lọc này.</p>:<div className="grid gap-3 sm:grid-cols-2">{values.map((value)=> <article key={`${value.currency}-${value.source}`} className="grid gap-2 rounded-control bg-surface-container-low p-3"><div className="flex items-center justify-between gap-2"><strong className="font-display text-base text-on-surface">{value.currency}</strong><span className="rounded-full bg-surface-container-high px-2 py-1 font-body text-[10px] text-graphite">{sourceName[value.source]??value.source}</span></div><p className="font-body text-caption text-graphite">Đơn có tổng đã quan sát: <strong className="text-on-surface">{value.orders_observed}</strong></p><p className="font-body text-caption text-graphite">Tổng marketplace: <strong className="text-on-surface">{value.marketplace_total==null?'Chưa có giá trị':`${value.marketplace_total} ${value.currency}`}</strong></p><p className="font-body text-caption text-graphite">Payment evidence: <strong className="text-on-surface">{value.payment_evidence_count}</strong> · {value.payment_evidence_amount==null?'chưa có số tiền':`${value.payment_evidence_amount} ${value.currency}`}</p></article>)}</div>}
  </Card>;
}
