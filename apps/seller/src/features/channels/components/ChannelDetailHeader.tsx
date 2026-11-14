import { navigate } from '../../../app/routes';
import { Breadcrumbs } from '../../../components/common/Breadcrumbs';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { cn } from '../../../lib/cn';
import type { SalesChannel } from '../channel.types';
import { connectionPresentation } from '../channel.utils';

const environmentNames = { production: 'Thật', sandbox: 'Thử nghiệm', simulation: 'Giả lập', development: 'Development Store', planned: 'Dự kiến' } as const;

export function ChannelDetailHeader({ channel }: { channel: SalesChannel }) {
  const connection = connectionPresentation[channel.connectionStatus];
  return <header className="grid gap-5"><Breadcrumbs items={[{ label: 'Kênh bán', onSelect: () => navigate('/channels') }, { label: channel.name }]} className="mb-0" /><div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center"><div className="flex min-w-0 items-center gap-4"><span className={cn('grid size-16 shrink-0 place-items-center rounded-card font-body text-base font-bold text-pure-white', channel.colorClass)}>{channel.iconLabel}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] font-bold tracking-tight text-on-surface">{channel.name}</h1><StatusBadge tone={connection.tone}>{connection.label}</StatusBadge></div><p className="mt-1 font-body text-body-sm text-graphite">{channel.subtitle} · <span>{environmentNames[channel.environment]}</span></p></div></div><div className="flex flex-wrap gap-2"><Button variant="secondary" disabled title="Chưa có">Đồng bộ kênh</Button><Button variant="secondary" disabled title="Chưa có">Cấp quyền lại</Button><Button disabled title="Chưa có">Nhập danh sách sản phẩm</Button></div></div></header>;
}
