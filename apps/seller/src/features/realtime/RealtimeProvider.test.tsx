import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RealtimeContext, useRealtimeRefresh, type RealtimeContextValue } from './RealtimeProvider';
import type { RealtimeSignal } from './manager';

function harness(status: RealtimeContextValue['status'] = 'live') {
  let listener: ((signal: RealtimeSignal) => void) | null = null;
  const value: RealtimeContextValue = {
    available: true,
    status,
    lastEventAt: null,
    lastReadyAt: null,
    lastError: null,
    reconnectAttempt: 0,
    nextRetryAt: null,
    droppedFrames: 0,
    subscribeChange: (next) => {
      listener = next;
      return () => { listener = null; };
    },
    resync: () => undefined,
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
  );
  return {
    wrapper,
    emit: (signal: RealtimeSignal) => listener?.(signal),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useRealtimeRefresh', () => {
  it('coalesces matching change notifications into one refresh', () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const stream = harness();
    renderHook(() => useRealtimeRefresh(['inventory'], refresh), { wrapper: stream.wrapper });

    act(() => {
      for (let index = 0; index < 100; index += 1) {
        stream.emit({ type: 'change', domains: ['inventory'], sku: `SKU-${index}`, at: '2026-10-22T00:00:00Z' });
      }
      stream.emit({ type: 'change', domains: ['orders'], orderId: 'order-1', at: '2026-10-22T00:00:01Z' });
    });
    act(() => vi.advanceTimersByTime(150));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('honours an entity predicate, while a resync always refreshes', () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const stream = harness();
    renderHook(() => useRealtimeRefresh(['inventory'], refresh, {
      match: (change) => change.sku === 'AO-01',
    }), { wrapper: stream.wrapper });

    act(() => {
      stream.emit({ type: 'change', domains: ['inventory'], sku: 'AO-02', at: '2026-10-22T00:00:00Z' });
    });
    act(() => vi.advanceTimersByTime(150));
    expect(refresh).not.toHaveBeenCalled();

    act(() => {
      stream.emit({ type: 'resync', reason: 'connected', at: '2026-10-22T00:00:01Z' });
    });
    act(() => vi.advanceTimersByTime(150));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('polls read-only only while the stream is not live', () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const stream = harness('degraded');
    renderHook(() => useRealtimeRefresh(['inventory'], refresh, { pollWhileDegradedMs: 5_000 }), {
      wrapper: stream.wrapper,
    });

    act(() => vi.advanceTimersByTime(4_999));
    expect(refresh).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('pauses degraded polling in a hidden tab and refreshes once on resume', () => {
    vi.useFakeTimers();
    const original = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    const refresh = vi.fn();
    const stream = harness('degraded');
    const { unmount } = renderHook(() => useRealtimeRefresh(['inventory'], refresh, { pollWhileDegradedMs: 5_000 }), {
      wrapper: stream.wrapper,
    });

    act(() => vi.advanceTimersByTime(20_000));
    expect(refresh).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(5_000));
    expect(refresh).toHaveBeenCalledTimes(2);

    unmount();
    if (original) Object.defineProperty(document, 'visibilityState', original);
  });
});
