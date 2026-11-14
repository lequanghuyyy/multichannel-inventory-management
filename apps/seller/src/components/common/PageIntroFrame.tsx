import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/** Shared cream-paper introduction frame for top-level seller pages. */
export function PageIntroFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <header className={cn('relative min-w-0 overflow-hidden rounded-lg border border-metric-ink bg-channel-paper p-5 shadow-metric sm:p-6', className)}>
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 rounded-l-lg bg-channel-accent" />
      <div className="relative z-10 min-w-0">{children}</div>
    </header>
  );
}
