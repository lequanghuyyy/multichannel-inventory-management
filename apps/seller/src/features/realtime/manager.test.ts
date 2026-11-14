import { afterEach, describe, expect, it, vi } from 'vitest';
import { RealtimeManager, type RealtimeSignal } from './manager';
import type { SyncStreamHandlers } from './transport';

function pendingRun() {
  let handlers: SyncStreamHandlers | null = null;
  let signal: AbortSignal | null = null;
  const run = vi.fn((nextHandlers: SyncStreamHandlers, nextSignal: AbortSignal) => {
    handlers = nextHandlers;
    signal = nextSignal;
    return new Promise<void>((resolve) => {
      nextSignal.addEventListener('abort', () => resolve(), { once: true });
    });
  });
  return {
    run,
    get handlers(): SyncStreamHandlers {
      if (!handlers) throw new Error('stream was not opened');
      return handlers;
    },
    get signal(): AbortSignal {
      if (!signal) throw new Error('stream was not opened');
      return signal;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('RealtimeManager', () => {
  it('announces ready, committed changes and dropped frames through the shared stream', () => {
    const stream = pendingRun();
    const manager = new RealtimeManager({ run: stream.run, isOnline: () => true });
    const signals: RealtimeSignal[] = [];
    manager.subscribeChange((signal) => signals.push(signal));

    manager.start();
    stream.handlers.onOpen();
    stream.handlers.onMessage({ event: 'ready', data: '{"at":"2026-10-22T00:00:00Z"}' });
    stream.handlers.onMessage({ event: 'change', data: '{"domains":["inventory"],"sku":"AO-01","at":"2026-10-22T00:00:01Z"}' });
    stream.handlers.onMessage({ event: 'dropped', data: '{"count":2}' });

    expect(stream.run).toHaveBeenCalledTimes(1);
    expect(manager.getSnapshot()).toMatchObject({ status: 'live', droppedFrames: 2, lastReadyAt: '2026-10-22T00:00:00Z' });
    expect(signals.map((signal) => signal.type)).toEqual(['resync', 'change', 'resync']);
    expect(signals[1]).toMatchObject({ type: 'change', domains: ['inventory'], sku: 'AO-01' });
    expect(signals[2]).toMatchObject({ type: 'resync', reason: 'dropped', dropped: 2 });
    manager.stop();
  });

  it('reconnects with bounded exponential backoff after a failure', async () => {
    vi.useFakeTimers();
    const run = vi.fn(() => Promise.reject(new Error('network down')));
    const manager = new RealtimeManager({ run, isOnline: () => true, baseDelayMs: 1000, maxDelayMs: 8000, random: () => 1 });

    manager.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    expect(manager.getSnapshot().status).toBe('degraded');
    expect(manager.getSnapshot().reconnectAttempt).toBe(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
    expect(manager.getSnapshot().reconnectAttempt).toBe(2);

    manager.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('closes a silent stream when heartbeat activity stops', async () => {
    vi.useFakeTimers();
    const stream = pendingRun();
    const manager = new RealtimeManager({ run: stream.run, isOnline: () => true, inactivityMs: 1000 });
    manager.start();
    await vi.advanceTimersByTimeAsync(0);
    stream.handlers.onOpen();
    expect(manager.getSnapshot().status).toBe('live');
    await vi.advanceTimersByTimeAsync(1000);
    expect(stream.signal.aborted).toBe(true);
    expect(manager.getSnapshot()).toMatchObject({ status: 'degraded', lastError: 'Sync stream heartbeat timed out' });
    manager.stop();
  });

  it('does not retry streams rejected by authentication', async () => {
    vi.useFakeTimers();
    const error = Object.assign(new Error('unauthorized'), { status: 401 });
    const run = vi.fn(() => Promise.reject(error));
    const manager = new RealtimeManager({ run, isOnline: () => true });
    manager.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    expect(manager.getSnapshot().status).toBe('disabled');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(1);
    manager.stop();
  });

  it('resyncs on resume and aborts the stream on stop', () => {
    const stream = pendingRun();
    const manager = new RealtimeManager({ run: stream.run, isOnline: () => true });
    const signals: RealtimeSignal[] = [];
    manager.subscribeChange((signal) => signals.push(signal));

    manager.start();
    stream.handlers.onOpen();
    stream.handlers.onMessage({ event: 'ready', data: '{"at":"2026-10-22T00:00:00Z"}' });
    signals.length = 0;

    manager.resume();
    expect(signals).toEqual([expect.objectContaining({ type: 'resync', reason: 'resume' })]);

    manager.stop();
    expect(stream.signal.aborted).toBe(true);
    expect(manager.getSnapshot().status).toBe('idle');
  });

  it('does not claim live while the browser is offline', async () => {
    const stream = pendingRun();
    let online = false;
    const manager = new RealtimeManager({ run: stream.run, isOnline: () => online });

    manager.start();
    expect(stream.run).not.toHaveBeenCalled();
    expect(manager.getSnapshot().status).toBe('offline');

    online = true;
    manager.resume();
    await Promise.resolve();
    expect(stream.run).toHaveBeenCalledTimes(1);
    manager.stop();
  });
});
