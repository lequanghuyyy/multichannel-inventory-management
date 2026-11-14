import type { components } from '../../api/generated/openapi';
import { createApiClient } from '../../api/client';
import { ApiRequestError, parseApiError } from '../../core/api-error';
import { isNativeSession } from './native-session-storage';

export type AuthUser = components['schemas']['AuthUser'];
export type SessionData = components['schemas']['WebSession'] | components['schemas']['MobileSession'];

async function requestError(response: Response, error: unknown): Promise<never> {
  if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
  if (response.headers.get('content-type')?.includes('application/json')) {
    const body: unknown = await response.json();
    throw new ApiRequestError(parseApiError(body), response.status);
  }
  throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
}

export async function login(email: string, password: string): Promise<SessionData> {
  const client = createApiClient();
  if (isNativeSession()) {
    const { data, error, response } = await client.POST('/api/v1/auth/mobile/login', { body: { email, password } });
    if (!response.ok || !data) return requestError(response, error);
    return data;
  }
  const { data, error, response } = await client.POST('/api/v1/auth/login', { body: { email, password } });
  if (!response.ok || !data) return requestError(response, error);
  return data;
}

export async function restoreSession(): Promise<SessionData> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/auth/session', { cache: 'no-store' });
  if (!response.ok || !data) return requestError(response, error);
  return data;
}

export async function revokeSession(): Promise<void> {
  const client = createApiClient();
  const { error, response } = await client.POST('/api/v1/auth/logout');
  if (!response.ok) return requestError(response, error);
}
