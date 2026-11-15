import type { ReactNode } from 'react';
import { StatusBadge, type StatusBadgeProps } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';

type MessageKind = 'error' | 'success' | 'warning' | 'info';

const messageStyles: Record<MessageKind, string> = {
  error: 'border-error/20 bg-error-container/40 text-error',
  success: 'border-badge-progress-text/15 bg-badge-progress-bg text-badge-progress-text',
  warning: 'border-badge-blocked-text/25 bg-badge-blocked-bg text-badge-blocked-text',
  info: 'border-badge-info-text/20 bg-badge-info-bg text-badge-info-text',
};

export function ProductChannelNotice({ kind, children }: { kind: MessageKind; children: ReactNode }) {
  return <div role={kind === 'error' || kind === 'warning' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 font-body text-body-sm ${messageStyles[kind]}`}>
    {children}
  </div>;
}

export function ProductChannelProgressNotice({ channelName, title, detail, refreshing, onRefresh }: {
  channelName: string; title?: string; detail: string; refreshing?: boolean; onRefresh?: () => void;
}) {
  return <ProductChannelNotice kind="info">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="flex min-w-0 items-start gap-2">
        <span aria-hidden="true" className="material-symbols-outlined motion-safe:animate-spin">progress_activity</span>
        <span><strong className="block">{title ?? `Đang xử lý yêu cầu trên ${channelName}`}</strong><span className="mt-0.5 block">{detail} Trạng thái tự cập nhật; không cần gửi lại.</span></span>
      </span>
      {onRefresh ? <Button size="sm" variant="secondary" disabled={refreshing} loading={refreshing} onClick={onRefresh}>Làm mới tiến trình</Button> : null}
    </div>
  </ProductChannelNotice>;
}

export function ProductChannelStatusGrid({ items }: { items: Array<{ label: string; value: string; tone?: StatusBadgeProps['tone'] }> }) {
  return <dl className="grid gap-2 border-y border-outline-variant/50 py-3 sm:grid-cols-2 xl:grid-cols-3">
    {items.map((item) => <div key={item.label} className="flex items-center justify-between gap-2 sm:block">
      <dt className="font-body text-caption text-graphite">{item.label}</dt>
      <dd className="mt-1"><StatusBadge tone={item.tone}>{item.value}</StatusBadge></dd>
    </div>)}
  </dl>;
}

export function ProductChannelActionCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <div className="grid content-start gap-3 rounded-lg border border-sandstone bg-pure-white p-3">
    <div><h4 className="text-sm font-semibold text-on-surface">{title}</h4><p className="mt-1 text-xs leading-5 text-graphite">{description}</p></div>
    <div className="grid gap-2">{children}</div>
  </div>;
}
