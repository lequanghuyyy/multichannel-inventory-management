import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../core/api-error';
import { getInventoryBySku, getInventoryRowBySku } from './inventory';

const snapshot = {
  variant_id: '20000000-0000-4000-8000-000000000002',
  product_id: '10000000-0000-4000-8000-000000000001',
  sku: 'SHOE-001-BLK-42',
  color: 'BLACK',
  size: '42',
  on_hand: 10,
  reserved: 2,
  safety_buffer: 1,
  available_to_sell: 7,
  version: 2,
};

afterEach(() => vi.unstubAllGlobals());

describe('inventory OpenAPI client', () => {
  it('calls the deployed GET endpoint through the Vite proxy and returns the server snapshot', async () => {
    const fetchMock = vi.fn<(request: Request, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify(snapshot), { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getInventoryBySku(snapshot.sku)).resolves.toEqual(snapshot);
    const request = fetchMock.mock.calls[0]?.[0];
    expect(request).toBeInstanceOf(Request);
    if (!request) throw new Error('Expected the OpenAPI client to call fetch.');
    expect(request.url).toBe('http://localhost:3000/api/v1/inventory/SHOE-001-BLK-42');
    expect(request.method).toBe('GET');
    expect(request.cache).toBe('no-store');
  });

  it('preserves structured non-2xx errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'SKU_NOT_FOUND', message: 'Canonical SKU was not found', request_id: 'req-123' } }), { status: 404, headers: { 'Content-Type': 'application/json' } })));

    await expect(getInventoryBySku('MISSING')).rejects.toMatchObject({ code: 'SKU_NOT_FOUND', requestId: 'req-123' } satisfies Partial<ApiRequestError>);
  });

  it('rejects a non-JSON HTTP error rather than treating it as an API response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('upstream failure', { status: 502, headers: { 'Content-Type': 'text/plain' } })));

    // A gateway that answers with an HTML error page must not be mistaken for an API
    // response; the client says it cannot reach the server instead.
    await expect(getInventoryBySku('SHOE-001-BLK-42')).rejects.toThrow('Không kết nối được máy chủ');
  });

  it('uses an exact SKU match from the priced inventory list and follows its cursor', async () => {
    const rows = [
      { ...snapshot, sku: 'OTHER-SHOE-001-BLK-42', price_minor: 990000, currency: 'VND' },
      { ...snapshot, price_minor: 1050000, currency: 'VND' },
    ];
    const fetchMock = vi.fn<(request: Request, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [rows[0]], next_cursor: 'inventory-next' }), { headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [rows[1]] }), { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getInventoryRowBySku('SHOE-001-BLK-42')).resolves.toEqual(rows[1]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL((fetchMock.mock.calls[0]?.[0] as Request).url).searchParams.get('q')).toBe('SHOE-001-BLK-42');
    expect(new URL((fetchMock.mock.calls[1]?.[0] as Request).url).searchParams.get('cursor')).toBe('inventory-next');
  });
});
