import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../core/api-error';
import { listProducts } from './products';
import { listOrders, createOrder } from './orders';
import { listInventory } from './inventory';

afterEach(() => vi.unstubAllGlobals());

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// The mock's parameter list is what makes `mock.calls[0]` a one-element tuple; without it
// TypeScript infers `[]` and reading the request is a type error even though fetch is
// genuinely called with a Request at runtime.
function requestCapture() {
  const mock = vi.fn<(request: Request, init?: RequestInit) => Promise<Response>>();
  vi.stubGlobal('fetch', mock);
  return mock;
}

describe('catalogue, order and inventory list clients', () => {
  it('reads the products page from its `products` key, not `items`', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ products: [{ id: 'p1', name: 'Runner' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const page = await listProducts();
    expect(page.items).toEqual([{ id: 'p1', name: 'Runner' }]);
    expect(page.nextCursor).toBeNull();
  });

  it('reads the orders page from its `orders` key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ orders: [{ id: 'o1' }], next_cursor: 'cursor-2' })));

    const page = await listOrders();
    expect(page.items).toEqual([{ id: 'o1' }]);
    expect(page.nextCursor).toBe('cursor-2');
  });

  it('reads the inventory page from its `items` key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [{ sku: 'SHOE-001-BLK-42' }] })));

    await expect(listInventory()).resolves.toEqual({ items: [{ sku: 'SHOE-001-BLK-42' }], nextCursor: null });
  });

  it('reports a missing collection key instead of silently returning an empty page', async () => {
    // A wrong key would otherwise render as "no products exist", which reads as a real
    // empty catalogue rather than a contract mismatch.
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [] })));

    await expect(listProducts()).rejects.toThrow('Dữ liệu nhận về không hợp lệ.');
  });

  it('sends filter and paging parameters the backend declared', async () => {
    const fetchMock = requestCapture();
    fetchMock.mockImplementation(async () => jsonResponse({ orders: [] }));

    await listOrders({ status: 'placed', channel: 'pos', limit: 10, cursor: 'c1' });
    const request = fetchMock.mock.calls[0]?.[0];
    if (!request) throw new Error('Expected the OpenAPI client to call fetch.');
    const url = new URL(request.url);
    expect(url.pathname).toBe('/api/v1/orders');
    expect(url.searchParams.get('status')).toBe('placed');
    expect(url.searchParams.get('channel')).toBe('pos');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('cursor')).toBe('c1');
  });

  it('preserves the backend error for an order list the backend cannot serve', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { code: 'ORDERS_UNAVAILABLE', message: 'orders unavailable', request_id: 'req-9' } }, 503)));

    await expect(listOrders()).rejects.toMatchObject({ code: 'ORDERS_UNAVAILABLE', requestId: 'req-9' } satisfies Partial<ApiRequestError>);
  });
});

describe('createOrder', () => {
  const order = {
    id: 'o1',
    reference: 'POS-1',
    channel_code: 'pos',
    status: 'placed',
    payment_status: 'unpaid',
    fulfillment_status: 'pending',
    currency: 'VND',
    item_count: 2,
    total_minor: 1980000,
    placed_at: '2026-10-04T00:00:00Z',
    updated_at: '2026-10-04T00:00:00Z',
  };

  it('posts the cart with the idempotency key as a request header', async () => {
    const fetchMock = requestCapture();
    fetchMock.mockImplementation(async () => jsonResponse(order, 201));

    await expect(createOrder({ reference: 'POS-1', lines: [{ sku: 'SHOE-001-BLK-42', quantity: 2 }] }, 'pos-cart-1')).resolves.toEqual(order);
    const request = fetchMock.mock.calls[0]?.[0];
    if (!request) throw new Error('Expected the OpenAPI client to call fetch.');
    expect(request.method).toBe('POST');
    expect(request.url).toBe('http://localhost:3000/api/v1/orders');
    expect(request.headers.get('Idempotency-Key')).toBe('pos-cart-1');
    await expect(request.json()).resolves.toEqual({ reference: 'POS-1', lines: [{ sku: 'SHOE-001-BLK-42', quantity: 2 }] });
  });

  it('surfaces a conflicting reuse of the same key rather than selling twice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { code: 'IDEMPOTENCY_CONFLICT', message: 'key reused with a different cart', request_id: 'req-10' } }, 409)));

    await expect(createOrder({ reference: 'POS-2', lines: [{ sku: 'SHOE-001-BLK-42', quantity: 1 }] }, 'pos-cart-1')).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
      requestId: 'req-10',
    } satisfies Partial<ApiRequestError>);
  });

  it('surfaces insufficient stock for a line the cart over-orders', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { code: 'INSUFFICIENT_STOCK', message: 'not enough stock', request_id: 'req-11' } }, 409)));

    await expect(createOrder({ reference: 'POS-3', lines: [{ sku: 'SHOE-001-BLK-42', quantity: 999 }] }, 'pos-cart-3')).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
    } satisfies Partial<ApiRequestError>);
  });
});