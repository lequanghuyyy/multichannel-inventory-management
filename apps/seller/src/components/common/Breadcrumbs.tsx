import { cn } from '../../lib/cn';

export interface BreadcrumbItem {
  label: string;
  onSelect?: () => void;
}

export interface BreadcrumbsProps {
  items: readonly BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ className, items }: BreadcrumbsProps) {
  return (
    <nav className={cn('mb-5 font-body text-caption text-graphite', className)} aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((item, index) => {
          const current = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-2">
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              {item.onSelect && !current ? (
                <button type="button" className="rounded-sm text-on-surface-variant hover:text-on-surface hover:underline" onClick={item.onSelect}>{item.label}</button>
              ) : (
                <span aria-current={current ? 'page' : undefined} className={current ? 'font-semibold text-on-surface' : undefined}>{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
