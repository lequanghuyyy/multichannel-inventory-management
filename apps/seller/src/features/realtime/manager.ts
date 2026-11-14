import type { SseMessage } from './sse';
import type { SyncStreamRunner } from './transport';
import { readSyncStream } from './transport';

export type RealtimeStatus = 'idle' | 'connecting' | 'live' | 'degraded' | 'offline' | 'disabled';

export interface RealtimeChange {
  type: 'change';
  domains: string[];
  entity?: string;
  sku?: string;
  variantId?: string;
  orderId?: string;
  eventId?: string;
  version?: number;
  at: string;
}

export interface RealtimeResync {
  type: 'resync';
  reason: 'connected' | 'resume' | 'dropped';
  at: string;
  dropped?: number;
}

export type RealtimeSignal = RealtimeChange | RealtimeResync;

export interface RealtimeSnapshot {
  status: RealtimeStatus;
  lastEventAt: string | null;
  lastReadyAt: string | null;
  lastError: string | null;
  reconnectAttempt: number;
  nextRetryAt: number | null;
  droppedFrames: number;
}

export interface RealtimeManagerOptions {
  run?: SyncStreamRunner;
  now?: () => number;
  random?: () => number;
  isOnline?: () => boolean;
  baseDelayMs?: number;
  maxDelayMs?: number;
  inactivityMs?: number;
}

type ChangeListener = (signal: RealtimeSignal) => void;
type StateListener = () => void;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Sync stream disconnected';
}

export class RealtimeManager {
  private readonly run: SyncStreamRunner;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly isOnline: () => boolean;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly inactivityMs: number;

  private readonly changeListeners = new Set<ChangeListener>();
  private readonly stateListeners = new Set<StateListener>();
  private started = false;
  private runId = 0;
  private current: AbortController | null = null;
  private wakeSleep: (() => void) | null = null;
  private forceReconnect = false;
  private attached = false;
  private resumeTimer: ReturnType<typeof setTimeout> | null = null;
  private snapshot: RealtimeSnapshot = {
    status: 'idle',
    lastEventAt: null,
    lastReadyAt: null,
    lastError: null,
    reconnectAttempt: 0,
    nextRetryAt: null,
    droppedFrames: 0,
  };

  constructor(options: RealtimeManagerOptions = {}) {
    this.run = options.run ?? readSyncStream;
    this.now = options.now ?? (() => Date.now());
    this.random = options.random ?? Math.random;
    this.isOnline = options.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);
    this.baseDelayMs = options.baseDelayMs ?? 1_000;
    this.maxDelayMs = options.maxDelayMs ?? 30_000;
    this.inactivityMs = options.inactivityMs ?? 45_000;
  }

  readonly getSnapshot = (): RealtimeSnapshot => this.snapshot;

  readonly subscribeState = (listener: StateListener): (() => void) => {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  };

  readonly subscribeChange = (listener: ChangeListener): (() => void) => {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  };

  readonly start = (): void => {
    if (this.started) return;
    this.started = true;
    const runId = ++this.runId;
    this.attachSignals();
    void this.loop(runId);
  };

  readonly stop = (): void => {
    if (!this.started && this.snapshot.status === 'idle') return;
    this.started = false;
    this.runId += 1;
    this.forceReconnect = false;
    this.detachSignals();
    this.current?.abort();
    this.current = null;
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
    this.resumeTimer = null;
    this.wakeSleep?.();
    this.wakeSleep = null;
    this.setSnapshot({ status: 'idle', reconnectAttempt: 0, nextRetryAt: null, lastError: null });
  };

  readonly resume = (): void => {
    if (!this.started) return;
    if (this.resumeTimer) return;
    this.resumeTimer = setTimeout(() => { this.resumeTimer = null; }, 500);
    if (this.snapshot.status === 'live') {
      this.emitResync('resume');
      this.forceReconnect = true;
      this.current?.abort();
      this.wakeSleep?.();
      return;
    }
    this.forceReconnect = true;
    this.current?.abort();
    this.wakeSleep?.();
  };

  private async loop(runId: number): Promise<void> {
    let attempt = 0;
    while (this.started && this.runId === runId) {
      if (this.forceReconnect) {
        this.forceReconnect = false;
        attempt = 0;
      }
      if (!this.isOnline()) {
        this.setSnapshot({ status: 'offline', lastError: null, reconnectAttempt: 0, nextRetryAt: null });
        await this.pause(2_000, runId);
        continue;
      }

      this.setSnapshot({
        status: attempt === 0 ? 'connecting' : 'degraded',
        reconnectAttempt: attempt,
        nextRetryAt: null,
      });
      const controller = new AbortController();
      this.current = controller;
      let timedOut = false;
      let watchdog: ReturnType<typeof setTimeout> | null = null;
      const clearWatchdog = () => {
        if (watchdog) clearTimeout(watchdog);
        watchdog = null;
      };
      const armWatchdog = () => {
        clearWatchdog();
        watchdog = setTimeout(() => {
          if (this.runId !== runId || controller.signal.aborted) return;
          timedOut = true;
          this.setSnapshot({ status: 'degraded', lastError: 'Sync stream heartbeat timed out' });
          controller.abort();
        }, this.inactivityMs);
      };
      try {
        await this.run({
          onOpen: () => {
            if (this.runId !== runId || controller.signal.aborted) return;
            armWatchdog();
            this.setSnapshot({ status: 'live', reconnectAttempt: 0, nextRetryAt: null, lastError: null });
          },
          onMessage: (message) => {
            if (this.runId === runId && !controller.signal.aborted) { armWatchdog(); this.handleMessage(message); }
          },
          onActivity: () => { if (this.runId === runId && !controller.signal.aborted) armWatchdog(); },
        }, controller.signal);
        if (this.runId === runId) {
          if (!timedOut) this.markDisconnected(new Error('Sync stream ended'));
        }
      } catch (error) {
        if (this.runId === runId && !isAbortError(error)) {
          const status = error && typeof error === 'object' && 'status' in error
            ? Number((error as { status: unknown }).status)
            : 0;
          if (status === 401 || status === 403) {
            this.started = false;
            this.detachSignals();
            this.setSnapshot({ status: 'disabled', lastError: `Sync stream authorization failed (${status})`, nextRetryAt: null });
            return;
          }
          this.markDisconnected(error);
        }
      } finally {
        clearWatchdog();
        if (this.current === controller) this.current = null;
      }
      if (!this.started || this.runId !== runId) break;
      if (this.forceReconnect) continue;

      attempt += 1;
      const delay = this.retryDelay(attempt);
      this.setSnapshot({
        status: 'degraded',
        reconnectAttempt: attempt,
        nextRetryAt: this.now() + delay,
      });
      await this.pause(delay, runId);
    }
  }

  private markDisconnected(error: unknown): void {
    this.setSnapshot({
      status: this.isOnline() ? 'degraded' : 'offline',
      lastError: messageOf(error),
    });
  }

  private retryDelay(attempt: number): number {
    const unbounded = this.baseDelayMs * 2 ** Math.min(attempt - 1, 10);
    const bounded = Math.min(this.maxDelayMs, unbounded);
    return Math.round(bounded * (0.5 + this.random() * 0.5));
  }

  private pause(ms: number, runId: number): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (this.wakeSleep === finish) this.wakeSleep = null;
        resolve();
      };
      this.wakeSleep = finish;
      if (this.runId !== runId) {
        finish();
        return;
      }
      timer = setTimeout(finish, ms);
    });
  }

  private handleMessage(message: SseMessage): void {
    if (message.event === 'ready') {
      const at = this.payloadAt(message.data) ?? new Date(this.now()).toISOString();
      this.setSnapshot({ status: 'live', lastReadyAt: at, lastError: null, reconnectAttempt: 0, nextRetryAt: null });
      this.emitResync('connected');
      return;
    }
    if (message.event === 'dropped') {
      const payload = this.parse(message.data);
      const count = typeof payload?.count === 'number' ? payload.count : 1;
      this.setSnapshot({ droppedFrames: this.snapshot.droppedFrames + count });
      this.emitResync('dropped', count);
      return;
    }
    if (message.event === 'event' || message.event === 'change' || message.event === 'message') {
      const payload = this.parse(message.data);
      if (!payload || payload.type === 'ping') return;
      const at = typeof payload.occurred_at === 'string'
        ? payload.occurred_at
        : typeof payload.at === 'string' ? payload.at : new Date(this.now()).toISOString();
      const change = this.toChange(message.event, payload, at);
      if (!change) return;
      this.setSnapshot({ lastEventAt: at });
      this.emit(change);
    }
  }

  private toChange(eventName: string, payload: Record<string, unknown>, at: string): RealtimeChange | null {
    const domains = Array.isArray(payload.domains)
      ? payload.domains.filter((value): value is string => typeof value === 'string')
      : eventName === 'event'
        ? ['inventory', 'sync', ...(typeof payload.correlation_id === 'string' ? ['orders'] : [])]
        : ['sync'];
    return {
      type: 'change',
      domains: domains.length > 0 ? domains : ['sync'],
      ...(typeof payload.entity === 'string' ? { entity: payload.entity } : {}),
      ...(typeof payload.sku === 'string' ? { sku: payload.sku } : {}),
      ...(typeof payload.variant_id === 'string' ? { variantId: payload.variant_id } : {}),
      ...(typeof payload.order_id === 'string'
        ? { orderId: payload.order_id }
        : typeof payload.correlation_id === 'string' ? { orderId: payload.correlation_id } : {}),
      ...(typeof payload.event_id === 'string' ? { eventId: payload.event_id } : {}),
      ...(typeof payload.version === 'number' ? { version: payload.version } : {}),
      at,
    };
  }

  private payloadAt(data: string): string | null {
    const payload = this.parse(data);
    return typeof payload?.at === 'string' ? payload.at : null;
  }

  private parse(data: string): Record<string, unknown> | null {
    try {
      const parsed: unknown = JSON.parse(data);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }

  private emitResync(reason: RealtimeResync['reason'], dropped?: number): void {
    this.emit({ type: 'resync', reason, at: new Date(this.now()).toISOString(), ...(dropped ? { dropped } : {}) });
  }

  private emit(signal: RealtimeSignal): void {
    for (const listener of this.changeListeners) listener(signal);
  }

  private setSnapshot(next: Partial<RealtimeSnapshot>): void {
    const merged = { ...this.snapshot, ...next };
    if (
      merged.status === this.snapshot.status &&
      merged.lastEventAt === this.snapshot.lastEventAt &&
      merged.lastReadyAt === this.snapshot.lastReadyAt &&
      merged.lastError === this.snapshot.lastError &&
      merged.reconnectAttempt === this.snapshot.reconnectAttempt &&
      merged.nextRetryAt === this.snapshot.nextRetryAt &&
      merged.droppedFrames === this.snapshot.droppedFrames
    ) return;
    this.snapshot = merged;
    for (const listener of this.stateListeners) listener();
  }

  private readonly onOnline = (): void => {
    if (!this.started) return;
    this.forceReconnect = true;
    this.current?.abort();
    this.wakeSleep?.();
  };

  private readonly onVisible = (): void => {
    if (!this.started || document.visibilityState !== 'visible') return;
    this.resume();
  };

  private readonly onFocus = (): void => {
    if (this.started) this.resume();
  };

  private attachSignals(): void {
    if (this.attached || typeof window === 'undefined') return;
    this.attached = true;
    window.addEventListener('online', this.onOnline);
    window.addEventListener('focus', this.onFocus);
    document.addEventListener('visibilitychange', this.onVisible);
  }

  private detachSignals(): void {
    if (!this.attached || typeof window === 'undefined') return;
    this.attached = false;
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('focus', this.onFocus);
    document.removeEventListener('visibilitychange', this.onVisible);
  }
}

export const realtimeManager = new RealtimeManager();
