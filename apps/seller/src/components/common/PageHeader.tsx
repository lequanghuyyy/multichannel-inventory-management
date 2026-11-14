import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
  className?: string;
}

export function PageHeader({ children, className, description, eyebrow, title }: PageHeaderProps) {
  return (
    <header className={cn('relative mb-8 flex flex-col justify-between gap-5 rounded-lg border border-metric-ink bg-channel-paper p-5 shadow-metric sm:p-7 md:flex-row md:items-end', className)}>
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 rounded-l-lg bg-channel-accent" />
      <div className="min-w-0">
        <p className="mb-2 font-body text-caption font-bold uppercase tracking-[0.13em] text-channel-accent">{eyebrow}</p>
        <h1 className="m-0 font-display text-[clamp(2rem,4vw,3rem)] font-bold leading-[1.05] tracking-[-0.035em] text-on-surface">{title}</h1>
        <p className="mt-3 max-w-2xl font-body text-base leading-6 text-graphite">{description}</p>
      </div>
      {children ? <div className="shrink-0 md:pl-4">{children}</div> : null}
    </header>
  );
}
