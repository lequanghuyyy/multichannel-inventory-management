import { useId, type SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Select({ children, className, error, hint, id, label, ...props }: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const descriptionId = error || hint ? `${selectId}-description` : undefined;

  return (
    <div className="grid gap-2 font-body text-body-sm text-on-surface">
      {label ? <label className="font-semibold" htmlFor={selectId}>{label}</label> : null}
      <span className="relative flex items-center">
        <select
          id={selectId}
          className={cn(
            'min-h-11 w-full appearance-none rounded-control border border-outline-variant bg-pure-white px-3 pr-10 text-sm text-on-surface focus:border-carbon focus:outline-none focus:ring-2 focus:ring-carbon/20',
            error ? 'border-error focus:border-error focus:ring-error/20' : null,
            className,
          )}
          aria-invalid={error ? true : undefined}
          aria-describedby={descriptionId}
          {...props}
        >
          {children}
        </select>
        <span className="material-symbols-outlined pointer-events-none absolute right-3 text-lg text-graphite" aria-hidden="true">expand_more</span>
      </span>
      {error || hint ? <span id={descriptionId} className={cn('text-caption', error ? 'text-error' : 'text-graphite')}>{error ?? hint}</span> : null}
    </div>
  );
}
