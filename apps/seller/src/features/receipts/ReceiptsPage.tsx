import { useEffect, useState, useTransition } from 'react';
import { href, navigate } from '../../app/routes';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/ScreenState';
import { Button } from '../../components/ui/Button';
import { PageIntroFrame } from '../../components/common/PageIntroFrame';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Tabs, type TabItem } from '../../components/ui/Tabs';
import { listReceipts, type ReceiptSummary } from '../../api/receipts';

const statusPresentation: Record<string, { label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' }> = {
  DRAFT: { label: 'Bản nháp', tone: 'neutral' },
  PARTIALLY_RECEIVED: { label: 'Nhận một phần', tone: 'warning' },
  RECEIVED: { label: 'Đã hoàn tất', tone: 'success' },
  CLOSED_SHORT: { label: 'Kết thúc sớm', tone: 'warning' },
  CANCELLED: { label: 'Đã hủy', tone: 'danger' },
};

const statusTabs: readonly TabItem<string>[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'DRAFT', label: 'Bản nháp' },
  { value: 'PARTIALLY_RECEIVED', label: 'Nhận một phần' },
  { value: 'RECEIVED', label: 'Đã hoàn tất' },
  { value: 'CLOSED_SHORT', label: 'Kết thúc sớm' },
  { value: 'CANCELLED', label: 'Đã hủy' },
];

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function ReceiptsPage() {
  const [receipts, setReceipts] = useState<ReceiptSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [status, setStatus] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [, startTransition] = useTransition();

  const loadData = async (cursorVal?: string) => {
    try {
      if (cursorVal) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
      }

      const res = await listReceipts({
        limit: 20,
        cursor: cursorVal,
        status: status === 'all' ? undefined : (status as 'DRAFT' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED'),
        query: query.trim() || undefined,
      });

      if (cursorVal) {
        setReceipts((prev) => [...prev, ...res.items]);
      } else {
        setReceipts(res.items);
      }
      setNextCursor(res.nextCursor);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [status]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void loadData();
  };

  return (
    <section className="mx-auto flex w-full max-w-[1240px] flex-col gap-7 py-8">
      <PageIntroFrame>
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2 font-body text-caption">
            <span className="font-semibold uppercase tracking-[0.16em] text-channel-accent">Nhập kho</span>
            <span className="size-1.5 rounded-full bg-traffic-maximize motion-safe:animate-pulse" aria-hidden="true" />
            <span className="font-semibold text-badge-progress-text">Cập nhật tồn kho tự động</span>
          </div>
          <h1 className="whitespace-nowrap font-display text-2xl sm:text-3xl lg:text-headline-md font-bold tracking-tight text-on-surface">
            Quản lý nhập hàng
          </h1>
          <p className="mt-1 max-w-3xl font-body text-body-sm leading-5 text-on-surface-variant">
            Tạo phiếu nhập từ nhà cung cấp, kiểm đếm hàng thực tế và xác nhận để tăng tồn kho.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            onClick={() => navigate(href({ name: 'receipt-create' }))}
            leadingIcon={<span className="material-symbols-outlined text-lg" aria-hidden="true">add</span>}
          >
            Tạo phiếu nhập mới
          </Button>
        </div>
      </div>
      </PageIntroFrame>

      <div className="grid gap-4 sm:flex sm:items-center sm:justify-between">
        <Tabs items={statusTabs} value={status} onValueChange={(val) => startTransition(() => setStatus(val))} ariaLabel="Lọc theo trạng thái" />
        <form onSubmit={handleSearchSubmit} className="flex gap-2 sm:w-80">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm mã phiếu, nhà cung cấp…"
            leading={<span className="material-symbols-outlined text-base">search</span>}
            className="w-full"
          />
          <Button variant="secondary" type="submit" size="sm">
            Tìm
          </Button>
        </form>
      </div>

      {loading ? (
        <LoadingState label="Đang tải danh sách phiếu nhập…" />
      ) : error ? (
        <ErrorState error={error} retry={() => void loadData()} />
      ) : receipts.length === 0 ? (
        <Card className="grid gap-3 p-8 text-center place-items-center">
          <span className="material-symbols-outlined text-4xl text-graphite">inventory_2</span>
          <EmptyState
            title="Chưa có phiếu nhập nào"
            detail={status !== 'all' || query ? 'Không có phiếu nhập nào khớp với bộ lọc hiện tại.' : 'Bắt đầu bằng việc tạo phiếu nhập kho đầu tiên cho cửa hàng.'}
          />
          {status === 'all' && !query ? (
            <Button onClick={() => navigate(href({ name: 'receipt-create' }))} className="mt-2">
              Tạo phiếu nhập ngay
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => {
                setStatus('all');
                setQuery('');
              }}
              className="mt-2"
            >
              Xóa bộ lọc
            </Button>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Phiếu nhập hàng">
            {receipts.map((r) => {
              const s = statusPresentation[r.status] ?? { label: r.status, tone: 'neutral' };
              const inspected = r.total_inspected ?? ((r.total_accepted || 0) + (r.total_rejected || 0));
              const accepted = r.total_accepted ?? r.total_received;
              const rejected = r.total_rejected ?? 0;
              const remaining = r.total_remaining ?? Math.max(0, r.total_expected - r.total_received);

              return (
                <article key={r.id} className="grid overflow-hidden rounded-lg border border-sandstone bg-channel-paper">
                  <header className="flex items-start justify-between gap-3 border-b border-dashed border-sandstone bg-surface-container-low p-4">
                    <div className="min-w-0">
                      <p className="font-body text-[10px] font-bold uppercase tracking-[0.16em] text-channel-accent">Phiếu nhập kho</p>
                      <code className="mt-1 block break-all font-mono text-body-sm font-bold text-on-surface">{r.receipt_number}</code>
                    </div>
                    <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                  </header>
                  <div className="grid content-start gap-3 p-4">
                    <div>
                      <span className="font-body text-caption text-graphite">Nhà cung cấp</span>
                      <strong className="mt-1 block break-words font-body text-body-sm text-on-surface">{r.supplier_name}</strong>
                    </div>
                    <dl className="grid grid-cols-2 gap-2 border-y border-outline-variant/50 py-2.5 font-body text-caption">
                      <div><dt className="text-graphite">Tham chiếu</dt><dd className="mt-0.5 break-all font-mono text-on-surface">{r.reference_number || '—'}</dd></div>
                      <div><dt className="text-graphite">Ngày tạo</dt><dd className="mt-0.5 text-on-surface">{formatTime(r.created_at)}</dd></div>
                      <div><dt className="text-graphite">Dòng hàng</dt><dd className="mt-0.5 font-semibold tabular-nums text-on-surface">{r.item_count} SKU</dd></div>
                      <div><dt className="text-graphite">Dự kiến</dt><dd className="mt-0.5 font-mono font-semibold tabular-nums text-on-surface">{r.total_expected} chiếc</dd></div>
                    </dl>

                    {/* Distinct Quantity Concepts Breakdown (Yêu cầu 5) */}
                    <div className="rounded-control bg-surface-container-low p-2.5 font-body text-caption">
                      <div className="grid grid-cols-4 gap-1 text-center font-mono">
                        <div>
                          <span className="text-[10px] uppercase text-graphite block">Đã kiểm</span>
                          <span className="font-bold text-on-surface tabular-nums">{inspected}</span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase text-graphite block">Đạt chuẩn</span>
                          <span className="font-bold text-badge-progress-text tabular-nums">{accepted}</span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase text-graphite block">Lỗi/Từ chối</span>
                          <span className="font-bold text-error tabular-nums">{rejected}</span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase text-graphite block">Còn lại</span>
                          <span className="font-bold text-on-surface tabular-nums">{remaining}</span>
                        </div>
                      </div>
                    </div>

                    {r.pending_rejection_count && r.pending_rejection_count > 0 ? (
                      <div className="flex items-center gap-1.5 rounded bg-error-container/40 px-2 py-1 text-caption font-medium text-error">
                        <span className="material-symbols-outlined text-sm" aria-hidden="true">warning</span>
                        <span>{r.pending_rejection_count} chênh lệch lỗi cần xử lý</span>
                      </div>
                    ) : null}

                    {r.status === 'CLOSED_SHORT' && r.closed_short_reason ? (
                      <div className="rounded bg-surface-container-low px-2 py-1 text-[11px] text-graphite border border-outline-variant/30">
                        <strong className="text-on-surface">Kết thúc sớm:</strong> {r.closed_short_reason}
                      </div>
                    ) : null}
                  </div>
                  <footer className="border-t-2 border-dashed border-sandstone bg-surface-container-low/60 p-3">
                    <Button variant="secondary" size="sm" className="w-full" onClick={() => navigate(href({ name: 'receipt-detail', id: r.id }))}>
                      Mở phiếu <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_forward</span>
                    </Button>
                  </footer>
                </article>
              );
            })}
          </div>

          <footer className="flex flex-col justify-between gap-3 border-t border-outline-variant/50 bg-surface-container-low/50 px-5 py-4 sm:flex-row sm:items-center">
            <span className="font-body text-caption text-graphite">Hiển thị {receipts.length} phiếu nhập</span>
            {nextCursor ? (
              <Button variant="secondary" size="sm" loading={loadingMore} onClick={() => void loadData(nextCursor)}>
                Tải thêm
              </Button>
            ) : null}
          </footer>
        </Card>
      )}
    </section>
  );
}
