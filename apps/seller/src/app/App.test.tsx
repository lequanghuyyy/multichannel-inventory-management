import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../features/auth/AuthProvider';
import { App } from './App';

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

it('protects a deep business route and renders login outside the workspace shell', async () => {
  window.history.replaceState({}, '', '/inventory/SHOE-001-BLK-42');
  const auth: AuthContextValue = {
    status: 'anonymous', user: null, error: null,
    login: vi.fn(), logout: vi.fn(), retry: vi.fn(),
  };
  render(<AuthContext.Provider value={auth}><App /></AuthContext.Provider>);
  expect(screen.getByRole('heading', { name: 'Đăng nhập vào hệ thống' })).toBeInTheDocument();
  expect(screen.queryByText(/Workspace/)).toBeNull();
  await waitFor(() => expect(window.location.pathname).toBe('/login'));
  expect(new URLSearchParams(window.location.search).get('next')).toBe('/inventory/SHOE-001-BLK-42');
});
