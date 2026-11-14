import { Button } from '../../../components/ui/Button';
import { Tabs, type TabItem } from '../../../components/ui/Tabs';
import type { PosSimMode } from '../pos.types';

const modes: readonly TabItem<PosSimMode>[] = [
  { value: 'normal', label: 'Bán hàng bình thường' },
  { value: 'conflict', label: 'Xung đột tồn kho' },
  { value: 'network', label: 'Mất mạng / Khoá' },
  { value: 'success', label: 'Xác nhận thành công' },
];

export function SimulatorSwitcher({
  mode,
  onModeChange,
  onResolveConflict,
  canSell,
}: {
  mode: PosSimMode;
  onModeChange: (mode: PosSimMode) => void;
  onResolveConflict: () => void;
  /** False in fixture mode, where pressing F9 posts nothing at all. */
  canSell: boolean;
}) {
  return (
    <section className="grid gap-3" aria-label="Giả lập trạng thái bán hàng">
      <Tabs ariaLabel="Trạng thái giả lập" idPrefix="pos" items={modes} value={mode} onValueChange={onModeChange} />
      <div id={`pos-panel-${mode}`} role="tabpanel" aria-labelledby={`pos-tab-${mode}`} tabIndex={0}>
        {mode === 'normal' ? (
          <div className="rounded-control border border-outline-variant/60 bg-surface-container-low px-4 py-3 font-body text-body-sm text-graphite">
            {canSell
              ? 'Bán hàng bình thường. Bấm xác nhận để tạo đơn từ giỏ hàng này.'
              : 'Đang ở chế độ minh hoạ bán hàng bình thường. Chưa có đơn nào được tạo.'}
          </div>
        ) : null}
        {mode === 'conflict' ? (
          <div className="flex flex-col gap-3 rounded-control bg-badge-blocked-bg px-4 py-3 font-body text-body-sm text-badge-blocked-text sm:flex-row sm:items-center sm:justify-between" role="alert">
            <p><strong>SHOE-001-BLK-42</strong> vừa bị kênh khác bán bớt. Số lượng có thể bán hiện chỉ còn 1.</p>
            <Button size="sm" variant="secondary" onClick={onResolveConflict}>Tự điều chỉnh số lượng</Button>
          </div>
        ) : null}
        {mode === 'network' ? (
          <div className="rounded-control bg-error-container px-4 py-3 font-body text-body-sm text-on-error-container" role="status">
            Mất kết nối. Giao dịch chưa được xác nhận, mã giao dịch <code className="font-mono font-bold">pos_77a9b</code>.
          </div>
        ) : null}
        {mode === 'success' ? (
          <div className="rounded-control bg-badge-progress-bg px-4 py-3 font-body text-body-sm text-badge-progress-text" role="status">
            Minh hoạ xác nhận thành công: <strong>Đơn POS-2026-00127</strong> · 3 sản phẩm. Chưa có đơn thật nào được tạo.
          </div>
        ) : null}
      </div>
    </section>
  );
}
