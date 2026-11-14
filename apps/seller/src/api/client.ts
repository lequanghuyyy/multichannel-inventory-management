import createClient from 'openapi-fetch';
import type { paths } from './generated/openapi';
import { apiBase, nativeApiBase } from '../config/env';
import { isNativeSession } from '../features/auth/native-session-storage';
import { notifyUnauthorized, runtimeAuthGeneration, runtimeBearer, runtimeCSRF } from '../features/auth/auth-runtime';

function resolvedBaseUrl(baseUrl: string): string {
  if (isNativeSession()) return nativeApiBase(baseUrl);
  if (baseUrl) return baseUrl;
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://vite-proxy.invalid';
}

export function createApiClient(baseUrl: string = apiBase()) {
  return createClient<paths>({
    baseUrl: resolvedBaseUrl(baseUrl),
    fetch: async (input) => {
      // openapi-fetch defers transport work until this callback, so enforce native origin
      // requirements here as well as while constructing the client.
      if (isNativeSession()) nativeApiBase(baseUrl);
      const requestGeneration = runtimeAuthGeneration();
      const original = input instanceof Request ? input : new Request(input);
      const headers = new Headers(original.headers);
      if (isNativeSession()) {
        const token = runtimeBearer();
        if (token) headers.set('Authorization', `Bearer ${token}`);
      } else {
        const csrf = runtimeCSRF();
        if (csrf && !['GET', 'HEAD', 'OPTIONS'].includes(original.method.toUpperCase())) headers.set('X-CSRF-Token', csrf);
      }
      const request = new Request(original, { headers, credentials: isNativeSession() ? 'omit' : 'include' });
      const response = await globalThis.fetch(request);
      if (response.status === 401) notifyUnauthorized(requestGeneration);
      return response;
    },
    headers: { Accept: 'application/json' },
  });
}

/** Raw response path for authenticated downloads whose body is not JSON (for example CSV). */
export async function apiFetch(path: string, init: RequestInit = {}, baseUrl: string = apiBase()): Promise<Response> {
  if (isNativeSession()) nativeApiBase(baseUrl);
  const requestGeneration = runtimeAuthGeneration();
  const headers = new Headers(init.headers);
  if (isNativeSession()) {
    const token = runtimeBearer();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  } else if (!['GET', 'HEAD', 'OPTIONS'].includes((init.method ?? 'GET').toUpperCase())) {
    const csrf = runtimeCSRF();
    if (csrf) headers.set('X-CSRF-Token', csrf);
  }
  const response = await globalThis.fetch(new Request(new URL(path, resolvedBaseUrl(baseUrl)), {
    ...init,
    headers,
    credentials: isNativeSession() ? 'omit' : 'include',
  }));
  if (response.status === 401) notifyUnauthorized(requestGeneration);
  return response;
}
