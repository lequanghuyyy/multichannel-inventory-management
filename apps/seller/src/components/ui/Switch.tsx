import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'role'> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: string;
}

export function Switch({ checked, className, description, disabled, label, onCheckedChange, ...props }: SwitchProps) {
  return (
    <div className="flex items-center justify-between gap-4 font-body text-body-sm text-on-surface">
      <span>
        <span className="block font-semibold">{label}</span>
        {description ? <span className="mt-0.5 block text-caption text-graphite">{description}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={typeof label === 'string' ? label : undefined}
        disabled={disabled}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60',
          checked ? 'bg-carbon' : 'bg-outline-variant',
          className,
        )}
        onClick={() => onCheckedChange(!checked)}
        {...props}
      >
        <span className={cn('absolute top-0.5 size-5 rounded-full bg-pure-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}
