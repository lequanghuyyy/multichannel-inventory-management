import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../core/api-error';

const mocks = vi.hoisted(() => ({
  restoreSession: vi.fn(), login: vi.fn(), revokeSession: vi.fn(),
  loadToken: vi.fn(), saveToken: vi.fn(), removeToken: vi.fn(),
  native: { value: false },
}));

vi.mock('./auth.api', () => ({
  restoreSession: mocks.restoreSession,
  login: mocks.login,
  revokeSession: mocks.revokeSession,
}));
vi.mock('./native-session-storage', () => ({
  isNativeSession: () => mocks.native.value,
  loadNativeSessionToken: mocks.loadToken,
  saveNativeSessionToken: mocks.saveToken,
  removeNativeSessionToken: mocks.removeToken,
}));

import { AuthProvider, useAuth } from './AuthProvider';
import { clearRuntimeAuth, notifyUnauthorized, runtimeAuthGeneration } from './auth-runtime';

const user = { id: '10000000-0000-4000-8000-000000000001', email: 'admin@example.test', role: 'ADMIN' as const };

function apiError(code: string) {
  return new ApiRequestError({ code, message: 'server message', request_id: 'req-auth' });
}

function Probe() {
  const auth = useAuth();
  return <div>
    <span>{auth.status}</span>
    <span>{auth.user?.role}</span>
    <button onClick={() => void auth.login('admin@example.test', 'password')}>login</button>
    <button onClick={() => void auth.logout()}>logout</button>
    <button onClick={auth.retry}>retry</button>
  </div>;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  clearRuntimeAuth();
  mocks.native.value = false;
});

it('restores a native session from secure storage before asking the server', async () => {
  mocks.native.value = true;
  mocks.loadToken.mockResolvedValue('persisted-native-token');
  mocks.restoreSession.mockResolvedValue({ user });
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByText('authenticated')).toBeInTheDocument());
  expect(mocks.loadToken).toHaveBeenCalledTimes(1);
  expect(mocks.restoreSession).toHaveBeenCalledTimes(1);
});

it('keeps protected content loading until the server validates the session', async () => {
  let resolveSession: ((value: { user: typeof user; csrf_token: string }) => void) | undefined;
  mocks.restoreSession.mockReturnValue(new Promise(resolve => { resolveSession = resolve; }));
  render(<AuthProvider><Probe /></AuthProvider>);
  expect(screen.getByText('loading')).toBeInTheDocument();
  resolveSession?.({ user, csrf_token: 'csrf' });
  await waitFor(() => expect(screen.getByText('authenticated')).toBeInTheDocument());
  expect(screen.getByText('ADMIN')).toBeInTheDocument();
});

it.each([
  ['AUTH_UNAVAILABLE', apiError('AUTH_UNAVAILABLE')],
  ['network error', new Error('offline')],
])('keeps the persisted native token after transient restore failure: %s', async (_name, failure) => {
  mocks.native.value = true;
  mocks.loadToken.mockResolvedValue('persisted-native-token');
  mocks.restoreSession.mockRejectedValue(failure);

  render(<AuthProvider><Probe /></AuthProvider>);

  await waitFor(() => expect(screen.getByText('error')).toBeInTheDocument());
  expect(mocks.removeToken).not.toHaveBeenCalled();
});

it.each(['UNAUTHENTICATED', 'SESSION_EXPIRED'])('removes the persisted native token after confirmed invalid credential: %s', async code => {
  mocks.native.value = true;
  mocks.loadToken.mockResolvedValue('persisted-native-token');
  mocks.restoreSession.mockRejectedValue(apiError(code));

  render(<AuthProvider><Probe /></AuthProvider>);

  await waitFor(() => expect(screen.getByText('anonymous')).toBeInTheDocument());
  expect(mocks.removeToken).toHaveBeenCalledTimes(1);
});

it('reloads the persisted native token on retry after a transient restore failure', async () => {
  mocks.native.value = true;
  mocks.loadToken.mockResolvedValue('persisted-native-token');
  mocks.restoreSession
    .mockRejectedValueOnce(apiError('AUTH_UNAVAILABLE'))
    .mockResolvedValueOnce({ user });

  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByText('error')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: 'retry' }));

  await waitFor(() => expect(screen.getByText('authenticated')).toBeInTheDocument());
  expect(mocks.loadToken).toHaveBeenCalledTimes(2);
  expect(mocks.restoreSession).toHaveBeenCalledTimes(2);
  expect(mocks.removeToken).not.toHaveBeenCalled();
});

it('supports login and server-revoked logout without persisting a web token', async () => {
  mocks.restoreSession.mockRejectedValue(apiError('UNAUTHENTICATED'));
  mocks.login.mockResolvedValue({ user, csrf_token: 'csrf' });
  mocks.revokeSession.mockResolvedValue(undefined);
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByText('anonymous')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'login' }));
  await waitFor(() => expect(screen.getByText('authenticated')).toBeInTheDocument());
  expect(mocks.saveToken).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'logout' }));
  await waitFor(() => expect(screen.getByText('anonymous')).toBeInTheDocument());
  expect(mocks.revokeSession).toHaveBeenCalledTimes(1);
});

it('does not clear local credentials or create an unhandled rejection when server logout fails', async () => {
  mocks.native.value = true;
  mocks.loadToken.mockResolvedValue('persisted-native-token');
  mocks.restoreSession.mockResolvedValue({ user });
  mocks.revokeSession.mockRejectedValue(apiError('AUTH_UNAVAILABLE'));

  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByText('authenticated')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: 'logout' }));

  await waitFor(() => expect(screen.getByText('error')).toBeInTheDocument());
  expect(mocks.removeToken).not.toHaveBeenCalled();
});

it('ignores a delayed 401 from an earlier session generation', async () => {
  mocks.restoreSession.mockRejectedValue(apiError('UNAUTHENTICATED'));
  mocks.login.mockResolvedValue({ user, csrf_token: 'csrf' });
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByText('anonymous')).toBeInTheDocument());

  const oldGeneration = runtimeAuthGeneration();
  fireEvent.click(screen.getByRole('button', { name: 'login' }));
  await waitFor(() => expect(screen.getByText('authenticated')).toBeInTheDocument());
  expect(runtimeAuthGeneration()).toBeGreaterThan(oldGeneration);

  notifyUnauthorized(oldGeneration);
  expect(screen.getByText('authenticated')).toBeInTheDocument();
});
