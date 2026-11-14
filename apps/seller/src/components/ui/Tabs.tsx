import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

export interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  value: T;
  onValueChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  idPrefix?: string;
}

export function Tabs<T extends string>({ ariaLabel, className, idPrefix, items, onValueChange, value }: TabsProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusTab = (start: number, direction: 1 | -1) => {
    let index = start;
    do {
      index = (index + direction + items.length) % items.length;
    } while (items[index]?.disabled && index !== start);
    const item = items[index];
    if (!item || item.disabled) return;
    onValueChange(item.value);
    refs.current[index]?.focus();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); focusTab(index, 1); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); focusTab(index, -1); }
    else if (event.key === 'Home') { event.preventDefault(); const first = items.findIndex((item) => !item.disabled); if (first >= 0) { onValueChange(items[first]!.value); refs.current[first]?.focus(); } }
    else if (event.key === 'End') { event.preventDefault(); let last = items.length - 1; while (last >= 0 && items[last]?.disabled) last -= 1; if (last >= 0) { onValueChange(items[last]!.value); refs.current[last]?.focus(); } }
  };
  return (
    <div className={cn('flex max-w-full gap-1 overflow-x-auto rounded-control border border-sandstone bg-tab-paper p-1', className)} role="tablist" aria-label={ariaLabel}>
      {items.map((item, index) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          aria-controls={idPrefix ? `${idPrefix}-panel-${item.value}` : undefined}
          id={idPrefix ? `${idPrefix}-tab-${item.value}` : undefined}
          tabIndex={value === item.value ? 0 : -1}
          disabled={item.disabled}
          className={cn(
            'min-h-9 shrink-0 rounded-md px-3 font-body text-body-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            value === item.value ? 'bg-pure-white text-on-surface shadow-sm ring-1 ring-metric-ink/10' : 'text-graphite hover:bg-pure-white/60 hover:text-on-surface',
          )}
          onClick={() => onValueChange(item.value)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          ref={(node) => { refs.current[index] = node; }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
