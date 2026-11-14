import { Button } from '../../../components/ui/Button';
import { PageIntroFrame } from '../../../components/common/PageIntroFrame';

export function AIHeader() {
  return <PageIntroFrame><div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div className="min-w-0"><p className="mb-1 font-body text-caption font-bold uppercase tracking-[0.14em] text-channel-accent">Hỗ trợ ra quyết định</p><h1 className="whitespace-nowrap font-display text-2xl sm:text-3xl lg:text-headline-md font-bold tracking-tight text-on-surface">Trợ lý AI</h1><p className="mt-3 max-w-3xl font-body text-body-sm leading-6 text-on-surface-variant">Xem nhu cầu bán hàng, dự báo và các đề xuất của AI. Mọi thay đổi tồn kho vẫn do bạn quyết định.</p></div><div className="flex shrink-0 flex-wrap gap-2"><Button variant="secondary" disabled title="Chưa có">Nhật ký AI</Button><Button disabled title="Chưa có">Chính sách AI</Button></div></div></PageIntroFrame>;
}
