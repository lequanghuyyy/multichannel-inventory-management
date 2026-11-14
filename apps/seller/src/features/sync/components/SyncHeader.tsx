import { PageIntroFrame } from '../../../components/common/PageIntroFrame';

export function SyncHeader() {
  return (
    <PageIntroFrame>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2 font-body text-caption font-semibold uppercase tracking-[0.14em] text-channel-accent"><span>Đồng bộ tồn kho</span></div>
        <h1 className="whitespace-nowrap font-display text-2xl sm:text-3xl lg:text-headline-md font-bold leading-none tracking-[-0.045em] text-on-surface">Đồng bộ</h1>
        <p className="mt-4 max-w-2xl font-body text-base leading-7 text-on-surface-variant">Theo dõi mỗi lần tồn kho thay đổi và việc cập nhật số lượng lên các kênh bán. Hiện chỉ đồng bộ với kênh giả lập, chưa kết nối sàn thật.</p>
      </div>
      </div>
    </PageIntroFrame>
  );
}
