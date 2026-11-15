import type { components } from '../../api/generated/openapi';
import { createApiClient } from '../../api/client';
import { ApiRequestError, responseApiError } from '../../core/api-error';
import { isNativeSession } from './native-session-storage';

export type AuthUser = components['schemas']['AuthUserResponse'];

/**
 * What the browser session needs after a login or a restore: the CSRF token for unsafe
 * requests and the user the navigation is filtered by.
 */
export interface SessionData {
  csrf_token: string;
  user: AuthUser;
}

/**
 * Spring Boot's mobile login route answers 501: bearer sessions are not supported yet. The web
 * app refuses locally for the same reason instead of showing a form that can never succeed.
 */
function nativeUnsupported(): ApiRequestError {
  return new ApiRequestError({
    code: 'UNAUTHORIZED',
    message: 'Xác thực di động (bearer token) chưa được hỗ trợ. Vui lòng dùng phiên web trên trình duyệt.',
    request_id: '',
  }, 501);
}

export async function login(email: string, password: string): Promise<SessionData> {
  if (isNativeSession()) throw nativeUnsupported();
  const client = createApiClient();
  const { data, response } = await client.POST('/api/v1/auth/login', { body: { email, password } });
  if (!response.ok) await responseApiError(response);
  if (!data?.user) throw new Error('Phản hồi đăng nhập không có thông tin người dùng.');
  return { csrf_token: data.csrf_token ?? '', user: data.user };
}

export async function restoreSession(): Promise<SessionData> {
  if (isNativeSession()) throw nativeUnsupported();
  const client = createApiClient();
  const { data, response } = await client.GET('/api/v1/auth/session', { cache: 'no-store' });
  if (!response.ok) await responseApiError(response);
  if (!data?.user) throw new ApiRequestError({ code: 'UNAUTHORIZED', message: 'Yêu cầu đăng nhập để thực hiện.', request_id: '' }, 401);
  return { csrf_token: data.csrf_token ?? '', user: data.user };
}

export async function revokeSession(): Promise<void> {
  const client = createApiClient();
  const { response } = await client.POST('/api/v1/auth/logout');
  if (!response.ok) await responseApiError(response);
}
