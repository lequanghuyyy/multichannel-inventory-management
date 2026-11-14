import type { Route } from '../app/routes';
import { currentNavigationLabel } from './navigation';
import type { AuthUser } from '../features/auth/auth.api';
import { Button } from '../components/ui/Button';

export function AppHeader({ route, user, onLogout }: { route: Route; user?: AuthUser; onLogout?: () => void }) {
  return (
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-sandstone py-3 md:min-h-[76px]">
      <div className="min-w-0"><span className="block font-body text-[9px] font-bold uppercase tracking-[0.16em] text-channel-accent">OctoFlow · Không gian làm việc</span><h2 className="mt-0.5 font-display text-lg font-bold leading-6 tracking-tight text-on-surface">{currentNavigationLabel(route)}</h2></div>
      {user ? <div className="flex min-w-0 items-center gap-2.5 rounded-lg border border-sandstone bg-surface-container-low px-2.5 py-2 sm:gap-3 sm:px-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-carbon font-display text-sm font-bold uppercase text-pure-white" aria-hidden="true">{user.email.slice(0, 1)}</span>
        <span className="min-w-0"><strong className="block max-w-[38vw] truncate font-body text-xs font-semibold leading-4 text-on-surface sm:max-w-56 sm:text-sm">{user.email}</strong><small className="block font-body text-caption leading-4 text-graphite">{user.role === 'ADMIN' ? 'Quản trị viên' : 'Nhân viên'}</small></span>
        <Button variant="ghost" size="sm" onClick={onLogout} className="shrink-0 px-2.5 text-xs">Đăng xuất</Button>
      </div> : null}
    </header>
  );
}
