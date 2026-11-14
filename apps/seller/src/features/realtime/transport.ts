import { apiBase, nativeApiBase } from '../../config/env';
import { notifyUnauthorized, runtimeAuthGeneration, runtimeBearer } from '../auth/auth-runtime';
import { isNativeSession } from '../auth/native-session-storage';
import type { SseMessage } from './sse';
import { SseParser } from './sse';

export interface SyncStreamHandlers {
  onOpen(): void;
  onMessage(message: SseMessage): void;
  /** Called for every received chunk, including SSE comment heartbeats. */
  onActivity?(): void;
}

export class SyncStreamHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Sync stream answered HTTP ${status}`);
    this.name = 'SyncStreamHttpError';
    this.status = status;
  }
}

export type SyncStreamRunner = (handlers: SyncStreamHandlers, signal: AbortSignal) => Promise<void>;

function syncStreamUrl(): string {
  const base = isNativeSession() ? nativeApiBase() : apiBase();
  return `${base}/api/v1/sync/stream`;
}

export async function readSyncStream(handlers: SyncStreamHandlers, signal: AbortSignal): Promise<void> {
  const generation = runtimeAuthGeneration();
  const headers = new Headers({ Accept: 'text/event-stream', 'Cache-Control': 'no-cache' });
  if (isNativeSession()) {
    const token = runtimeBearer();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await globalThis.fetch(syncStreamUrl(), {
    method: 'GET',
    headers,
    credentials: isNativeSession() ? 'omit' : 'include',
    cache: 'no-store',
    signal,
  });
  if (!response.ok) {
    if (response.status === 401) notifyUnauthorized(generation);
    throw new SyncStreamHttpError(response.status);
  }
  if (!response.body) throw new Error('Sync stream returned no response body');

  handlers.onOpen();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      handlers.onActivity?.();
      const messages = parser.feed(decoder.decode(value, { stream: true }));
      for (const message of messages) handlers.onMessage(message);
    }
    const tail = decoder.decode();
    for (const message of [...parser.feed(tail), ...parser.end()]) handlers.onMessage(message);
  } finally {
    reader.releaseLock();
  }
}
