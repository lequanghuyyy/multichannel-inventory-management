import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type CardVariant = 'default' | 'muted' | 'accent';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

const variants: Record<CardVariant, string> = {
  default: 'bg-pure-white shadow-card ring-1 ring-black/5',
  muted: 'bg-surface-container-low',
  accent: 'bg-badge-blocked-bg text-badge-blocked-text',
};

export function Card({ className, variant = 'default', ...props }: CardProps) {
  return <div className={cn('min-w-0 rounded-card p-5', variants[variant], className)} {...props} />;
}
