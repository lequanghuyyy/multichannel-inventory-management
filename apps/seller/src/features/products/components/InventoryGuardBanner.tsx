import { navigate } from '../../../app/routes';
import { Button } from '../../../components/ui/Button';

export function InventoryGuardBanner() {
  return (
    <aside className="flex flex-col justify-between gap-5 rounded-card bg-primary-container px-5 py-5 text-pure-white sm:flex-row sm:items-center sm:px-6" aria-label="Bảo vệ tồn kho đa kênh">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined mt-0.5 text-2xl text-traffic-maximize" aria-hidden="true">shield_lock</span>
        <div>
          <h2 className="whitespace-nowrap font-display text-lg font-bold">Bảo vệ tồn kho đa kênh đang hoạt động</h2>
          <p className="mt-1 max-w-3xl font-body text-body-sm leading-5 text-pure-white/70">Khi tồn kho xuống dưới mức tồn đệm an toàn, hệ thống sẽ giới hạn số lượng đăng lên các kênh để giảm nguy cơ bán vượt tồn.</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => navigate('/channels')}>Mở cấu hình kênh</Button>
        <Button size="sm" className="bg-pure-white/10 hover:bg-pure-white/20" onClick={() => navigate('/inventory')}>Tra cứu tồn kho</Button>
      </div>
    </aside>
  );
}
