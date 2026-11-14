import type { Route } from '../app/routes';
import { href } from '../app/routes';
import octoflowMark from '../assets/octoflow-mark-dark.svg';
import { cn } from '../lib/cn';
import { isNavigationActive, visibleNavigationItems } from './navigation';
import type { AuthUser } from '../features/auth/auth.api';

export interface AppSidebarProps {
  route: Route;
  onNavigate: (path: string) => void;
  user?: AuthUser;
}

export function AppSidebar({ onNavigate, route, user }: AppSidebarProps) {
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-outline-variant/50 bg-surface px-4 py-7 md:flex" aria-label="Điều hướng chính">
      <button className="flex items-center gap-3 rounded-control px-2 py-1 text-left transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown" type="button" onClick={() => onNavigate('/')}>
        <span className="grid size-11 shrink-0 place-items-center rounded-lg border border-carbon bg-carbon shadow-[4px_4px_0_0_#000000]"><img src={octoflowMark} alt="" className="size-9 object-contain" /></span>
        <span className="min-w-0"><span className="block font-display text-xl font-extrabold leading-5 tracking-[-0.055em] text-carbon">Octo<span className="text-channel-accent">Flow</span></span><small className="mt-1 block font-body text-[9px] font-semibold uppercase tracking-[0.12em] text-graphite">Bán hàng đa kênh</small></span>
      </button>
      <p className="mb-3 mt-12 px-2 font-body text-[10px] tracking-[0.14em] text-graphite">MENU</p>
      <nav className="grid gap-1" aria-label="Menu">
        {visibleNavigationItems(user).map((item) => {
          const active = isNavigationActive(route, item.name);
          return (
            <button
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group flex min-h-11 items-center gap-3 rounded-full px-3 text-left font-body text-sm transition-colors',
                active ? 'bg-carbon text-pure-white' : 'text-graphite hover:bg-charcoal hover:text-channel-paper',
              )}
              key={item.name}
              type="button"
              onClick={() => onNavigate(href({ name: item.name }))}
            >
              <span className={cn('material-symbols-outlined w-5 text-center text-xl transition-colors', active ? 'text-pure-white' : 'text-carbon group-hover:text-channel-paper')} aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
