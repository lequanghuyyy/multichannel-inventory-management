import { useRef, type KeyboardEvent } from 'react';
import { cn } from '../../../lib/cn';
import type { SettingsSection } from '../settings.types';

export interface SettingsNavigationProps {
  value: SettingsSection;
  onChange: (value: SettingsSection) => void;
}

const items: ReadonlyArray<{ value: SettingsSection; label: string; detail: string; icon: string }> = [
  { value: 'store', label: 'Cửa hàng', detail: 'Dữ liệu mẫu', icon: 'storefront' },
  { value: 'warehouse', label: 'Kho hàng', detail: '1 kho', icon: 'warehouse' },
  { value: 'access', label: 'Thành viên', detail: '4 người', icon: 'group' },
  { value: 'preferences', label: 'Tuỳ chọn', detail: 'Trong phiên', icon: 'tune' },
];

export function SettingsNavigation({ onChange, value }: SettingsNavigationProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusTab = (index: number) => {
    const normalized = (index + items.length) % items.length;
    const next = items[normalized]!;
    onChange(next.value);
    refs.current[normalized]?.focus();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); focusTab(index + 1); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); focusTab(index - 1); }
    else if (event.key === 'Home') { event.preventDefault(); focusTab(0); }
    else if (event.key === 'End') { event.preventDefault(); focusTab(items.length - 1); }
  };

  return (
    <nav className="overflow-x-auto border-b border-outline-variant/60 pb-2" aria-label="Các mục cài đặt">
      <div className="flex min-w-max gap-2" role="tablist" aria-label="Các mục cài đặt">
        {items.map((item, index) => {
          const active = item.value === value;
          return (
            <button
              aria-controls={`settings-panel-${item.value}`}
              aria-selected={active}
              className={cn('flex min-h-12 min-w-40 items-center gap-3 rounded-control border px-3.5 text-left font-body transition-colors', active ? 'border-carbon bg-carbon text-pure-white' : 'border-outline-variant/70 bg-pure-white text-on-surface hover:bg-surface-container-low')}
              id={`settings-tab-${item.value}`}
              key={item.value}
              onClick={() => onChange(item.value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              ref={(node) => { refs.current[index] = node; }}
              role="tab"
              tabIndex={active ? 0 : -1}
              type="button"
            >
              <span className="material-symbols-outlined text-xl" aria-hidden="true">{item.icon}</span>
              <span><strong className="block text-body-sm">{item.label}</strong><small className={cn('block text-caption', active ? 'text-pure-white/65' : 'text-graphite')}>{item.detail}</small></span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
