import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leading?: ReactNode;
}

export function Input({ className, error, hint, id, label, leading, ...props }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = error || hint ? `${inputId}-description` : undefined;

  return (
    <div className="grid gap-2 font-body text-body-sm text-on-surface">
      {label ? <label className="font-semibold" htmlFor={inputId}>{label}</label> : null}
      <span className="relative flex items-center">
        {leading ? <span className="pointer-events-none absolute left-3 flex text-graphite" aria-hidden="true">{leading}</span> : null}
        <input
          id={inputId}
          className={cn(
            'min-h-11 w-full rounded-control border border-outline-variant bg-pure-white px-3 text-sm text-on-surface placeholder:text-graphite/70 focus:border-carbon focus:outline-none focus:ring-2 focus:ring-carbon/20',
            leading ? 'pl-10' : null,
            error ? 'border-error focus:border-error focus:ring-error/20' : null,
            className,
          )}
          aria-invalid={error ? true : undefined}
          aria-describedby={descriptionId}
          {...props}
        />
      </span>
      {error || hint ? <span id={descriptionId} className={cn('text-caption', error ? 'text-error' : 'text-graphite')}>{error ?? hint}</span> : null}
    </div>
  );
}
