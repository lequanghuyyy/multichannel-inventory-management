import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export function FilterToolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-3 rounded-card bg-pure-white p-4 shadow-card ring-1 ring-black/5 md:flex-row md:items-end', className)} {...props} />;
}
