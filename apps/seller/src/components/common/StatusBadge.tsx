import type { ReactNode } from 'react';
import { Badge, type BadgeVariant } from '../ui/Badge';

export interface StatusBadgeProps {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
  live?: boolean;
}

const variants: Record<NonNullable<StatusBadgeProps['tone']>, BadgeVariant> = {
  neutral: 'neutral',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
};

export function StatusBadge({ children, live = false, tone = 'neutral' }: StatusBadgeProps) {
  return (
    <Badge variant={variants[tone]}>
      {live ? <span className="mr-1.5 size-1.5 rounded-full bg-current motion-safe:animate-pulse" aria-hidden="true" /> : null}
      {children}
    </Badge>
  );
}
