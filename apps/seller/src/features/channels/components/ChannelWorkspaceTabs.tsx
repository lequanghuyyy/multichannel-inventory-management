import type { KeyboardEvent } from 'react';

export const channelWorkspaceTabs = [
  { id: 'overview', label: 'Tổng quan', icon: 'dashboard' },
  { id: 'products', label: 'Sản phẩm', icon: 'sell' },
  { id: 'inventory', label: 'Tồn kho', icon: 'inventory_2' },
  { id: 'orders', label: 'Đơn hàng', icon: 'receipt_long' },
  { id: 'history', label: 'Lịch sử', icon: 'history' },
  { id: 'settings', label: 'Cài đặt', icon: 'settings' },
] as const;

export type ChannelWorkspaceTab = typeof channelWorkspaceTabs[number]['id'];

export function isChannelWorkspaceTab(value: string | null): value is ChannelWorkspaceTab {
  return channelWorkspaceTabs.some((tab) => tab.id === value);
}

export function ChannelWorkspaceTabs({
  value,
  onChange,
  placement = 'sidebar',
}: {
  value: ChannelWorkspaceTab;
  onChange: (tab: ChannelWorkspaceTab) => void;
  placement?: 'sidebar' | 'mobile';
}) {
  const handleKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = channelWorkspaceTabs.findIndex((tab) => tab.id === value);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % channelWorkspaceTabs.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + channelWorkspaceTabs.length) % channelWorkspaceTabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = channelWorkspaceTabs.length - 1;
    else return;
    event.preventDefault();
    const next = channelWorkspaceTabs[nextIndex];
    if (!next) return;
    onChange(next.id);
    document.getElementById(`channel-workspace-tab-${placement}-${next.id}`)?.focus();
  };

  const isMobile = placement === 'mobile';

  return <nav
    className={isMobile
      ? 'flex min-w-0 gap-1 overflow-x-auto border-b border-outline-variant/50 bg-surface px-3 py-2 md:hidden'
      : 'hidden min-w-0 gap-1 md:grid'}
    role="tablist"
    aria-orientation={isMobile ? 'horizontal' : 'vertical'}
    aria-label="Mục quản lý kênh"
  >
    {channelWorkspaceTabs.map((tab) => <button
      id={`channel-workspace-tab-${placement}-${tab.id}`}
      key={tab.id}
      type="button"
      role="tab"
      aria-selected={value === tab.id}
      aria-controls={value === tab.id ? `channel-workspace-panel-${tab.id}` : undefined}
      tabIndex={value === tab.id ? 0 : -1}
      onClick={() => onChange(tab.id)}
      onKeyDown={handleKey}
      className={`group flex min-h-11 shrink-0 items-center gap-3 rounded-full px-3 py-2 text-left font-body text-sm transition-colors ${isMobile ? 'min-w-[112px] justify-center' : 'w-full'} ${value === tab.id ? 'bg-carbon text-pure-white' : 'text-graphite hover:bg-charcoal hover:text-channel-paper'}`}
    ><span className="material-symbols-outlined text-lg" aria-hidden="true">{tab.icon}</span><span className="truncate">{tab.label}</span></button>)}
  </nav>;
}
