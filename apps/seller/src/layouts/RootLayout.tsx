import type { ReactNode } from 'react';
import type { Route } from '../app/routes';
import { navigate } from '../app/routes';
import { AppHeader } from './AppHeader';
import { AppSidebar } from './AppSidebar';
import { MobileNavigation } from './MobileNavigation';
import type { AuthUser } from '../features/auth/auth.api';

export interface RootLayoutProps {
  route: Route;
  children: ReactNode;
  user?: AuthUser;
  onLogout?: () => void;
}

export function RootLayout({ children, route, user, onLogout }: RootLayoutProps) {
  return (
    <div className="min-h-dvh bg-pure-white md:grid md:grid-cols-[212px_minmax(0,1fr)] xl:grid-cols-[246px_minmax(0,1fr)]">
      <AppSidebar route={route} onNavigate={navigate} user={user} />
      <main className="mx-auto min-w-0 w-full max-w-[1360px] px-5 pb-[calc(5rem+env(safe-area-inset-bottom))] md:px-7 md:pb-14 xl:px-11">
        <AppHeader route={route} user={user} onLogout={onLogout} />
        {children}
      </main>
      <MobileNavigation route={route} onNavigate={navigate} user={user} />
    </div>
  );
}
