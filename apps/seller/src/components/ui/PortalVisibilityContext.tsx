import { createContext, useContext, type ReactNode } from 'react';

const PortalVisibilityContext = createContext(true);

export function PortalVisibilityProvider({ active, children }: { active: boolean; children: ReactNode }) {
  return <PortalVisibilityContext.Provider value={active}>{children}</PortalVisibilityContext.Provider>;
}

export function usePortalVisibility(): boolean {
  return useContext(PortalVisibilityContext);
}
