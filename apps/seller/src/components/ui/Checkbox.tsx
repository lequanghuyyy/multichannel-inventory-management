import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: string;
}

export function Checkbox({ className, description, id, label, ...props }: CheckboxProps) {
  const generatedId = useId();
  const checkboxId = id ?? generatedId;
  const descriptionId = description ? `${checkboxId}-description` : undefined;

  return (
    <label className="flex cursor-pointer items-start gap-3 font-body text-body-sm text-on-surface" htmlFor={checkboxId}>
      <input
        id={checkboxId}
        type="checkbox"
        className={cn('mt-0.5 size-4 rounded border-outline accent-carbon', className)}
        aria-describedby={descriptionId}
        {...props}
      />
      <span>
        <span className="block font-semibold">{label}</span>
        {description ? <span id={descriptionId} className="mt-0.5 block text-caption text-graphite">{description}</span> : null}
      </span>
    </label>
  );
}
