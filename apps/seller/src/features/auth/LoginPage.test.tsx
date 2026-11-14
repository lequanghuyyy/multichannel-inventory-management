import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../core/api-error';
import { AuthContext, type AuthContextValue } from './AuthProvider';
import { LoginPage } from './LoginPage';

afterEach(cleanup);

function renderLogin(login: AuthContextValue['login'], onSuccess = vi.fn()) {
  const value: AuthContextValue = { status: 'anonymous', user: null, error: null, login, logout: vi.fn(), retry: vi.fn() };
  render(<AuthContext.Provider value={value}><LoginPage onSuccess={onSuccess} /></AuthContext.Provider>);
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@example.test' } });
  fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'not-a-real-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
  return onSuccess;
}

it('continues after a successful login', async () => {
  const onSuccess = renderLogin(vi.fn().mockResolvedValue(undefined));
  await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
});

it('uses a generic invalid-credentials message without exposing server text', async () => {
  renderLogin(vi.fn().mockRejectedValue(new ApiRequestError({ code: 'INVALID_CREDENTIALS', message: 'email exists but password is wrong', request_id: 'req' })));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Thông tin đăng nhập không hợp lệ'));
  expect(screen.getByRole('alert')).not.toHaveTextContent('email exists');
});

it('submits only one login request before React can disable the button', async () => {
  let resolveLogin: (() => void) | undefined;
  const login = vi.fn(() => new Promise<void>(resolve => { resolveLogin = resolve; }));
  const value: AuthContextValue = { status: 'anonymous', user: null, error: null, login, logout: vi.fn(), retry: vi.fn() };
  render(<AuthContext.Provider value={value}><LoginPage onSuccess={vi.fn()} /></AuthContext.Provider>);
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@example.test' } });
  fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'password' } });

  const form = screen.getByRole('button', { name: 'Đăng nhập' }).closest('form');
  if (!form) throw new Error('Login form is missing');
  fireEvent.submit(form);
  fireEvent.submit(form);

  expect(login).toHaveBeenCalledTimes(1);
  resolveLogin?.();
});
