import { afterEach, describe, expect, it, vi } from 'vitest';

const { native } = vi.hoisted(() => ({ native: { value: false } }));
vi.mock('../features/auth/native-session-storage', () => ({ isNativeSession: () => native.value }));

import { createApiClient } from './client';
import { clearRuntimeAuth, onUnauthorized, setRuntimeBearer, setRuntimeCSRF } from '../features/auth/auth-runtime';

const user = { id: '10000000-0000-4000-8000-000000000001', email: 'admin@example.test', role: 'ADMIN' };

afterEach(() => {
  clearRuntimeAuth();
  native.value = false;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('authenticated API transport', () => {
  it('uses cookie credentials and CSRF for unsafe web requests', async () => {
    const fetchMock = vi.fn<(request: Request) => Promise<Response>>(async () => new Response(JSON.stringify({ logged_out: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    setRuntimeCSRF('runtime-csrf');

    await createApiClient('https://api.example.test').POST('/api/v1/auth/logout');

    const request = fetchMock.mock.calls[0]?.[0];
    expect(request?.credentials).toBe('include');
    expect(request?.headers.get('X-CSRF-Token')).toBe('runtime-csrf');
    expect(request?.headers.get('Authorization')).toBeNull();
  });

  it('uses cookie credentials without CSRF for web GET', async () => {
    const fetchMock = vi.fn<(request: Request) => Promise<Response>>(async () => new Response(JSON.stringify({ user, csrf_token: 'server-csrf' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    setRuntimeCSRF('runtime-csrf');

    await createApiClient('https://api.example.test').GET('/api/v1/auth/session');

    const request = fetchMock.mock.calls[0]?.[0];
    expect(request?.credentials).toBe('include');
    expect(request?.headers.get('X-CSRF-Token')).toBeNull();
  });

  it('uses bearer auth with omitted credentials and no CSRF for native requests', async () => {
    native.value = true;
    const fetchMock = vi.fn<(request: Request) => Promise<Response>>(async () => new Response(JSON.stringify({ user }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    setRuntimeBearer('opaque-native-token');
    setRuntimeCSRF('must-not-be-sent');

    await createApiClient('https://api.example.test').GET('/api/v1/auth/session');

    const request = fetchMock.mock.calls[0]?.[0];
    expect(request?.credentials).toBe('omit');
    expect(request?.headers.get('Authorization')).toBe('Bearer opaque-native-token');
    expect(request?.headers.get('X-CSRF-Token')).toBeNull();
  });

  it.each(['', 'http://api.example.test', 'https://localhost', 'https://localhost.', 'https://127.0.0.1:8080', 'https://[::1]', 'capacitor://localhost', 'https://api.example.test/api', 'https://user:password@api.example.test'])('rejects an unsafe native API base before fetch: %s', async (base) => {
    native.value = true;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(() => createApiClient(base)).toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves web development requests through the browser origin proxy', async () => {
    const fetchMock = vi.fn<(request: Request) => Promise<Response>>(async () => new Response(JSON.stringify({ user }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    await createApiClient('').GET('/api/v1/auth/session');
    const request = fetchMock.mock.calls[0]?.[0];
    expect(request?.url).toBe(new URL('/api/v1/auth/session', window.location.origin).toString());
    expect(request?.credentials).toBe('include');
  });

  it('notifies unauthorized handling for 401 but not for 503', async () => {
    const unauthorized = vi.fn();
    const unsubscribe = onUnauthorized(unauthorized);
    const fetchMock = vi.fn<(request: Request) => Promise<Response>>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'required', request_id: 'req-401' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'AUTH_UNAVAILABLE', message: 'temporary', request_id: 'req-503' } }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await createApiClient('https://api.example.test').GET('/api/v1/auth/session');
    expect(unauthorized).toHaveBeenCalledTimes(1);

    await createApiClient('https://api.example.test').GET('/api/v1/auth/session');
    expect(unauthorized).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
