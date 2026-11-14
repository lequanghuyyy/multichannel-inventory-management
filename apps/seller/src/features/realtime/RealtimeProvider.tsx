import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { App } from '@capacitor/app';
import { useAuth } from '../auth/AuthProvider';
import { isNativeSession } from '../auth/native-session-storage';
import { runtimeAuthGeneration } from '../auth/auth-runtime';
import {
  realtimeManager,
  type RealtimeChange,
  type RealtimeSignal,
  type RealtimeSnapshot,
  type RealtimeStatus,
} from './manager';

export interface RealtimeContextValue extends RealtimeSnapshot {
  available: boolean;
  subscribeChange(listener: (signal: RealtimeSignal) => void): () => void;
  resync(): void;
}

const disabledSnapshot: RealtimeSnapshot = {
  status: 'disabled',
  lastEventAt: null,
  lastReadyAt: null,
  lastError: null,
  reconnectAttempt: 0,
  nextRetryAt: null,
  droppedFrames: 0,
};

const noopSubscribe = () => () => undefined;
const defaultValue: RealtimeContextValue = {
  ...disabledSnapshot,
  available: false,
  subscribeChange: noopSubscribe,
  resync: () => undefined,
};

export const RealtimeContext = createContext<RealtimeContextValue>(defaultValue);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const authGeneration = runtimeAuthGeneration();
  const snapshot = useSyncExternalStore(realtimeManager.subscribeState, realtimeManager.getSnapshot, realtimeManager.getSnapshot);

  useEffect(() => {
    if (auth.status !== 'authenticated') {
      realtimeManager.stop();
      return;
    }
    realtimeManager.start();
    return () => realtimeManager.stop();
  }, [auth.status, authGeneration]);

  useEffect(() => {
    if (!isNativeSession()) return;
    let cancelled = false;
    let remove: (() => Promise<void>) | null = null;
    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) realtimeManager.resume();
    }).then((handle) => {
      if (cancelled) void handle.remove();
      else remove = () => handle.remove();
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      void remove?.();
    };
  }, []);

  return (
    <RealtimeContext.Provider value={{
      ...snapshot,
      available: true,
      subscribeChange: realtimeManager.subscribeChange,
      resync: realtimeManager.resume,
    }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeContextValue {
  return useContext(RealtimeContext);
}

export interface RealtimeRefreshOptions {
  match?: (change: RealtimeChange) => boolean;
  pollWhileDegradedMs?: number;
  refreshOnResync?: boolean;
}

function isDomainMatch(domains: readonly string[], change: RealtimeChange): boolean {
  return change.domains.some((domain) => domain === '*' || domains.includes(domain));
}

export function useRealtimeRefresh(
  domains: readonly string[],
  refresh: () => void,
  options: RealtimeRefreshOptions = {},
): void {
  const realtime = useRealtime();
  const refreshRef = useRef(refresh);
  const matchRef = useRef(options.match);
  const refreshOnResyncRef = useRef(options.refreshOnResync ?? true);
  refreshRef.current = refresh;
  matchRef.current = options.match;
  refreshOnResyncRef.current = options.refreshOnResync ?? true;
  const key = domains.join('|');
  const subscribe = realtime.subscribeChange;
  const available = realtime.available;
  const status: RealtimeStatus = realtime.status;
  const pollMs = options.pollWhileDegradedMs ?? 0;

  useEffect(() => {
    if (!available) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribe((signal) => {
      if (signal.type === 'change') {
        if (!isDomainMatch(domains, signal)) return;
        if (matchRef.current && !matchRef.current(signal)) return;
      } else if (!refreshOnResyncRef.current) {
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        refreshRef.current();
      }, 150);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [available, key, subscribe]);

  useEffect(() => {
    if (!available || pollMs <= 0 || status === 'live' || status === 'disabled') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const schedule = (delay = pollMs) => {
      if (stopped || document.visibilityState === 'hidden') return;
      timer = setTimeout(() => {
        timer = null;
        refreshRef.current();
        schedule();
      }, delay);
    };
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') {
        if (timer) clearTimeout(timer);
        timer = null;
        return;
      }
      if (!timer) {
        refreshRef.current();
        schedule();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    schedule();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [available, pollMs, status]);
}
