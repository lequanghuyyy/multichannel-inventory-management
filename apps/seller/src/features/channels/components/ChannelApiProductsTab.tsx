import type { Channel, ChannelMapping } from '../../../api/channels';
import { EmptyState, ErrorState, LoadingState } from '../../../components/common/ScreenState';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';

export function ChannelApiProductsTab({
  channel,
  mappings,
  totalCount,
  loading,
  error,
  loadingMore,
  hasMore,
  onLoadMore,
  onRefresh,
}: {
  channel: Channel;
  mappings: ChannelMapping[];
  totalCount: number;
  loading: boolean;
  error?: unknown;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="grid min-w-0 gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-on-surface">Sản phẩm</h2>
          <p className="mt-1 text-sm text-graphite">
            Đã tải {mappings.length} dòng · {totalCount.toLocaleString('vi-VN')} SKU đã mapping trên toàn kênh
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onRefresh}
          loading={loading}
          leadingIcon={<span className="material-symbols-outlined text-base" aria-hidden="true">refresh</span>}
        >
          Làm mới
        </Button>
      </header>

      {loading && mappings.length === 0 ? <LoadingState label="Đang tải danh sách mapping…" /> : null}
      {!loading && error && mappings.length === 0 ? <ErrorState error={error} retry={onRefresh} /> : null}
      {!loading && !error && mappings.length === 0 ? (
        <EmptyState title="Chưa có SKU mapping" detail="Kênh chưa có sản phẩm hoặc biến thể nào được liên kết." />
      ) : null}

      {mappings.length > 0 ? (
        <Card className="min-w-0 overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <caption className="sr-only">Danh sách SKU đã mapping trên {channel.name}</caption>
              <thead>
                <tr className="h-11 border-b border-outline-variant/50 bg-surface-container-low font-body text-caption font-semibold uppercase tracking-wider text-graphite">
                  <th className="px-5">SKU trên sàn</th>
                  <th className="px-3">SKU nội bộ</th>
                  <th className="px-3">Trạng thái</th>
                  <th className="px-3 text-right">Phiên bản</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {mappings.map((mapping) => (
                  <tr key={mapping.id} className="font-body text-body-sm hover:bg-surface-container-low/50">
                    <td className="px-5 py-3 font-mono font-medium text-on-surface">
                      {mapping.external_sku}
                    </td>
                    <td className="px-3 py-3 font-mono text-on-surface-variant">
                      {mapping.canonical_sku || '—'}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge tone={mapping.drifted ? 'warning' : 'success'}>
                        {mapping.push_state === 'current' ? 'Đã đồng bộ' : mapping.push_state}
                      </StatusBadge>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-caption tabular-nums text-graphite">
                      v{mapping.pushed_version}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore ? (
            <footer className="flex items-center justify-between border-t border-outline-variant/50 p-4">
              <span className="text-caption text-graphite">
                Đã tải {mappings.length} / {totalCount} SKU
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={onLoadMore}
                loading={loadingMore}
                disabled={loadingMore}
              >
                Tải thêm mapping
              </Button>
            </footer>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
