import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'dark';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variants: Record<BadgeVariant, string> = {
  neutral: 'bg-badge-neutral-bg text-badge-neutral-text',
  success: 'bg-badge-progress-bg text-badge-progress-text',
  warning: 'bg-badge-blocked-bg text-badge-blocked-text',
  danger: 'bg-error-container text-on-error-container',
  dark: 'bg-carbon text-pure-white',
};

export function Badge({ className, variant = 'neutral', ...props }: BadgeProps) {
  return <span className={cn('inline-flex min-h-6 items-center rounded-full px-2.5 py-1 font-body text-caption font-semibold', variants[variant], className)} {...props} />;
}
