import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSyncStream } from './transport';

const { isNativeSession, runtimeBearer, runtimeAuthGeneration, notifyUnauthorized } = vi.hoisted(() => ({
  isNativeSession: vi.fn(() => true),
  runtimeBearer: vi.fn(() => 'mobile-session-secret'),
  runtimeAuthGeneration: vi.fn(() => 7),
  notifyUnauthorized: vi.fn(),
}));

vi.mock('../auth/native-session-storage', () => ({ isNativeSession }));
vi.mock('../auth/auth-runtime', () => ({ runtimeBearer, runtimeAuthGeneration, notifyUnauthorized }));
vi.mock('../../config/env', () => ({ apiBase: () => 'https://api.example', nativeApiBase: () => 'https://native-api.example' }));

afterEach(() => {
  vi.restoreAllMocks();
  isNativeSession.mockReturnValue(true);
  runtimeBearer.mockReturnValue('mobile-session-secret');
  runtimeAuthGeneration.mockReturnValue(7);
});

describe('readSyncStream transport authentication', () => {
  it('sends mobile bearer in Authorization and never in the URL', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('event: ready\ndata: {"at":"now"}\n\n'));
    const onOpen = vi.fn();
    const onMessage = vi.fn();
    await readSyncStream({ onOpen, onMessage }, new AbortController().signal);

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://native-api.example/api/v1/sync/stream');
    expect(url).not.toContain('mobile-session-secret');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer mobile-session-secret');
    expect(init.credentials).toBe('omit');
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ event: 'ready' }));
  });

  it('notifies the current auth generation on 401 without putting the token in the URL', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('unauthorized', { status: 401 }));
    await expect(readSyncStream({ onOpen: vi.fn(), onMessage: vi.fn() }, new AbortController().signal)).rejects.toMatchObject({ status: 401 });
    expect(notifyUnauthorized).toHaveBeenCalledWith(7);
  });
});
