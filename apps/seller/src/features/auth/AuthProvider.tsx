import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiRequestError } from '../../core/api-error';
import { login as loginRequest, restoreSession, revokeSession, type AuthUser } from './auth.api';
import { activateRuntimeAuth, clearRuntimeAuth, onUnauthorized, runtimeAuthGeneration } from './auth-runtime';
import { isNativeSession, loadNativeSessionToken, removeNativeSessionToken } from './native-session-storage';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'error';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  error: unknown;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  retry(): void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function isCredentialInvalid(error: unknown): boolean {
  return error instanceof ApiRequestError && ['UNAUTHORIZED', 'UNAUTHENTICATED', 'SESSION_EXPIRED'].includes(error.code);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const statusRef = useRef<AuthStatus>(status);
  const loginInFlight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => onUnauthorized((requestGeneration) => {
    if (requestGeneration !== runtimeAuthGeneration()) return;
    clearRuntimeAuth();
    setUser(null);
    setStatus('anonymous');
    if (isNativeSession()) void Promise.resolve(removeNativeSessionToken()).catch(() => undefined);
  }), []);

  useEffect(() => {
    const controller = new AbortController();
    let restoreGeneration = runtimeAuthGeneration();
    void (async () => {
      // Only show the full-screen loading state on the INITIAL mount or an explicit retry().
      // Background revalidation (focus/visibilitychange/online) must be silent: setting
      // 'loading' here would unmount the entire app tree and destroy local state (filters,
      // scroll position, form input, POS cart) every time the user Alt+Tabs back.
      if (statusRef.current !== 'authenticated') setStatus('loading');
      setError(null);
      try {
        let token = '';
        if (isNativeSession()) {
          token = await loadNativeSessionToken();
          if (!token) {
            setStatus('anonymous');
            return;
          }
          activateRuntimeAuth({ bearer: token });
          restoreGeneration = runtimeAuthGeneration();
        }
        const session = await restoreSession();
        if (controller.signal.aborted) return;
        activateRuntimeAuth({ bearer: isNativeSession() ? token : '', csrf: session.csrf_token });
        setUser(session.user);
        setStatus('authenticated');
      } catch (nextError: unknown) {
        if (controller.signal.aborted) return;
        if (isCredentialInvalid(nextError)) {
          if (restoreGeneration === runtimeAuthGeneration()) {
            clearRuntimeAuth();
            if (isNativeSession()) await Promise.resolve(removeNativeSessionToken()).catch(() => undefined);
          }
          setUser(null);
          setStatus('anonymous');
        } else {
          if (restoreGeneration === runtimeAuthGeneration()) clearRuntimeAuth();
          setError(nextError);
          setStatus('error');
        }
      }
    })();
    return () => controller.abort();
  }, [attempt]);

  const login = async (email: string, password: string) => {
    if (loginInFlight.current) return loginInFlight.current;
    const task = (async () => {
      const session = await loginRequest(email, password);
      activateRuntimeAuth({ csrf: session.csrf_token });
      setUser(session.user);
      setError(null);
      setStatus('authenticated');
    })();
    loginInFlight.current = task;
    try {
      await task;
    } finally {
      if (loginInFlight.current === task) loginInFlight.current = null;
    }
  };

  const logout = async () => {
    setError(null);
    try {
      await revokeSession();
      await Promise.resolve(removeNativeSessionToken()).catch(() => undefined);
      clearRuntimeAuth();
      setUser(null);
      setStatus('anonymous');
    } catch (nextError: unknown) {
      if (isCredentialInvalid(nextError)) {
        clearRuntimeAuth();
        if (isNativeSession()) await Promise.resolve(removeNativeSessionToken()).catch(() => undefined);
        setUser(null);
        setStatus('anonymous');
      } else {
        setError(nextError);
        setStatus('error');
      }
    }
  };

  useEffect(() => {
    const revalidate = () => {
      if (statusRef.current === 'authenticated') setAttempt(value => value + 1);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') revalidate();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', revalidate);
    window.addEventListener('online', revalidate);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', revalidate);
      window.removeEventListener('online', revalidate);
    };
  }, []);

  return <AuthContext.Provider value={{ status, user, error, login, logout, retry: () => setAttempt(value => value + 1) }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
