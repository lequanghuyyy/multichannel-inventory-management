import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiBase, loadSnapshot, parseHealth, parseSystem } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('API contract', () => {
  it('accepts actual health and preserves unavailable state', () => {
    expect(parseHealth({ status: 'not_ready', service: 'datt-api', version: 'test', database: 'unavailable' }).database).toBe('unavailable');
  });
  it.each([null, [], {}, { status: 'ok' }, { status: 'ok', service: 'x', version: 'y', database: 'made-up' }])('rejects invalid health %j', (value) => {
    expect(() => parseHealth(value)).toThrow();
  });
  it('accepts every sweeper state and rejects a made-up one', () => {
    // The sweeper field is a warning channel, so an unrecognised value has to be rejected
    // rather than passed through: a typo in the API would otherwise surface as a health
    // panel that silently shows nothing.
    for (const state of ['ok', 'stale', 'never_run'] as const) {
      expect(parseHealth({ status: 'ready', service: 'x', version: 'y', sweeper: state }).sweeper).toBe(state);
    }
    expect(parseHealth({ status: 'ready', service: 'x', version: 'y' }).sweeper).toBeUndefined();
    expect(() => parseHealth({ status: 'ready', service: 'x', version: 'y', sweeper: 'broken' })).toThrow();
  });
  it('rejects readiness flags expressed as strings', () => {
    expect(() => parseSystem({ stage: 'foundation', service: 'x', version: '1', inventory_ready: 'false', marketplace_connected: false, ai_ready: false })).toThrow();
  });
  it('preserves optional route capability flags and rejects non-booleans', () => {
    const value = { stage: 'foundation', service: 'x', version: '1', inventory_ready: false, inventory_read_available: true, inventory_write_available: false, catalog_available: true, catalog_write_available: false, marketplace_connected: false, ai_ready: false };
    expect(parseSystem(value).inventory_read_available).toBe(true);
    expect(parseSystem(value).catalog_available).toBe(true);
    expect(parseSystem(value).catalog_write_available).toBe(false);
    expect(() => parseSystem({ ...value, inventory_write_available: 'false' })).toThrow();
    expect(() => parseSystem({ ...value, catalog_write_available: 'false' })).toThrow();
  });
  it('normalizes an origin and rejects credentials and paths', () => {
    expect(apiBase('https://api.example.com/')).toBe('https://api.example.com');
    expect(apiBase('')).toBe('');
    for (const bad of ['file:///tmp/test', 'https://user:secret@example.com', 'https://example.com/api', 'https://example.com?key=x']) {
      expect(() => apiBase(bad)).toThrow();
    }
  });
  it('keeps database unavailability, rather than pretending it is healthy', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const body = url.endsWith('/system')
        ? { stage: 'foundation', service: 'datt-api', version: 'test', inventory_ready: false, marketplace_connected: false, ai_ready: false }
        : { status: url.endsWith('/ready') ? 'not_ready' : 'ok', service: 'datt-api', version: 'test', ...(url.endsWith('/ready') ? { database: 'unavailable' } : {}) };
      return new Response(JSON.stringify(body), { status: url.endsWith('/ready') ? 503 : 200, headers: { 'Content-Type': 'application/json' } });
    }));
    const result = await loadSnapshot(new AbortController().signal);
    expect(result.ready.database).toBe('unavailable');
    expect(result.system.inventory_ready).toBe(false);
  });
});
