import type { ReportSnapshotFixture } from '../report.types';

export function ReportProvenance({ snapshot }: { snapshot: ReportSnapshotFixture }) {
  return (
    <aside className="grid overflow-hidden rounded-card bg-primary-container text-pure-white lg:grid-cols-[1.4fr_repeat(3,minmax(0,0.7fr))]" aria-label="Nguồn số liệu báo cáo">
      <div className="p-5 sm:p-7"><p className="font-body text-caption font-bold uppercase tracking-[0.13em] text-pure-white/45">Khoảng phân tích</p><h2 className="mt-8 font-display text-2xl font-bold tracking-tight">Đây là báo cáo xem nhanh, không phải chốt sổ.</h2><p className="mt-2 max-w-xl font-body text-body-sm leading-6 text-pure-white/60">Chỉ số, biểu đồ và nhận xét ở đây là dữ liệu mẫu. Chưa có tính năng xuất hay gửi báo cáo định kỳ.</p></div>
      <div className="grid grid-cols-3 gap-px bg-pure-white/10 lg:col-span-3"><div className="bg-primary-container p-4 sm:p-5"><span className="font-body text-[10px] font-bold uppercase tracking-[0.1em] text-pure-white/40">Kỳ</span><strong className="mt-8 block font-mono text-caption sm:text-body-sm">{snapshot.periodLabel}</strong></div><div className="bg-primary-container p-4 sm:p-5"><span className="font-body text-[10px] font-bold uppercase tracking-[0.1em] text-pure-white/40">Ghi nhận lúc</span><strong className="mt-8 block font-mono text-caption sm:text-body-sm">{snapshot.capturedAt}</strong></div><div className="bg-primary-container p-4 sm:p-5"><span className="font-body text-[10px] font-bold uppercase tracking-[0.1em] text-pure-white/40">Nguồn dữ liệu</span><strong className="mt-8 block font-mono text-caption sm:text-body-sm">Không có</strong></div></div>
    </aside>
  );
}
