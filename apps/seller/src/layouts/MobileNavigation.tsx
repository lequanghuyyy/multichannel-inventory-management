import { useState } from 'react';
import type { Route } from '../app/routes';
import { href } from '../app/routes';
import { cn } from '../lib/cn';
import { isNavigationActive, visibleNavigationItems } from './navigation';
import type { AuthUser } from '../features/auth/auth.api';

export interface MobileNavigationProps {
  route: Route;
  onNavigate: (path: string) => void;
  user?: AuthUser;
}

export function MobileNavigation({ onNavigate, route, user }: MobileNavigationProps) {
  const navigationItems = visibleNavigationItems(user);
  const primaryItems = navigationItems.slice(0, 4);
  const secondaryItems = navigationItems.slice(4);
  const [moreOpen, setMoreOpen] = useState(false);
  const navigateAndClose = (path: string) => {
    setMoreOpen(false);
    onNavigate(path);
  };
  const moreActive = secondaryItems.some((item) => isNavigationActive(route, item.name));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 gap-0.5 border-t border-outline-variant/60 bg-white/95 px-[max(0.5rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md md:hidden" aria-label="Điều hướng nhanh">
      {primaryItems.map((item) => {
        const active = isNavigationActive(route, item.name);
        return (
          <button
            aria-label={item.label}
            aria-current={active ? 'page' : undefined}
            className={cn('group grid min-h-12 place-items-center gap-0.5 rounded-control font-body text-[10px] transition-colors', active ? 'bg-charcoal text-channel-paper' : 'text-graphite hover:bg-charcoal hover:text-channel-paper')}
            key={item.name}
            type="button"
            onClick={() => navigateAndClose(href({ name: item.name }))}
          >
            <span className={cn('material-symbols-outlined text-xl transition-colors', active ? 'text-channel-paper' : 'text-carbon group-hover:text-channel-paper')} aria-hidden="true">{item.icon}</span>
            {item.label}
          </button>
        );
      })}
      <div className="relative">
        <button
          aria-label="Thêm"
          aria-expanded={moreOpen}
          aria-controls="mobile-more-menu"
          className={cn('group grid min-h-12 w-full place-items-center gap-0.5 rounded-control font-body text-[10px] transition-colors', moreActive ? 'bg-charcoal text-channel-paper' : 'text-graphite hover:bg-charcoal hover:text-channel-paper')}
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
        >
          <span className={cn('material-symbols-outlined text-xl transition-colors', moreActive ? 'text-channel-paper' : 'text-carbon group-hover:text-channel-paper')} aria-hidden="true">more_horiz</span>
          Thêm
        </button>
        {moreOpen ? (
          <div id="mobile-more-menu" className="absolute bottom-[calc(100%+0.5rem)] right-0 grid min-w-40 gap-1 rounded-card bg-pure-white p-2 shadow-artifact" role="menu">
            {secondaryItems.map((item) => (
              <button
                aria-label={item.label}
                className="group flex min-h-10 items-center gap-2 rounded-control bg-surface-container-low px-3 text-left font-body text-body-sm text-on-surface transition-colors hover:bg-charcoal hover:text-channel-paper"
                key={item.name}
                role="menuitem"
                type="button"
                onClick={() => navigateAndClose(href({ name: item.name }))}
              >
                <span className="material-symbols-outlined text-lg text-carbon transition-colors group-hover:text-channel-paper" aria-hidden="true">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </nav>
  );
}
