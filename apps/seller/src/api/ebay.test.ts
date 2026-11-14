import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEbayOrderFailures, getEbayOperationalStatus, retryEbayOrderFailure } from './ebay';

afterEach(() => vi.unstubAllGlobals());

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('eBay operational and malformed-order APIs', () => {
  it('reads the failure ledger with filters and keeps its recovery state', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => response({ failures: [{ id: 'failure-1', recovery_status: 'blocked', retry_count: 2 }], limit: 25, offset: 0 }));
    vi.stubGlobal('fetch', fetchMock);
    const page = await getEbayOrderFailures('channel-1', { status: 'blocked', limit: 25 });
    expect(page.failures[0]).toMatchObject({ id: 'failure-1', recovery_status: 'blocked', retry_count: 2 });
    const request = fetchMock.mock.calls[0]?.[0] as Request | undefined;
    if (!request) throw new Error('Expected the OpenAPI client to read the failure ledger.');
    const url = new URL(request.url);
    expect(url.pathname).toBe('/api/v1/channels/channel-1/ebay/order-failures');
    expect(url.searchParams.get('status')).toBe('blocked');
    expect(url.searchParams.get('limit')).toBe('25');
  });

  it('reads database-backed polling and verified sync evidence', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => response({
      orders_imported: 4, malformed_failures_open: 1, pending_sync_jobs: 2, blocked_sync_jobs: 1,
      last_order_poll_error: 'REMOTE_TIMEOUT',
    })));
    await expect(getEbayOperationalStatus('channel-1')).resolves.toMatchObject({
      orders_imported: 4, malformed_failures_open: 1, pending_sync_jobs: 2, blocked_sync_jobs: 1,
      last_order_poll_error: 'REMOTE_TIMEOUT',
    });
  });

  it('posts an explicit retry action and returns the audited result', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => response({ failure: { id: 'failure-1', recovery_status: 'resolved' }, recovered: true }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(retryEbayOrderFailure('channel-1', 'failure-1')).resolves.toMatchObject({ recovered: true });
    const request = fetchMock.mock.calls[0]?.[0] as Request | undefined;
    if (!request) throw new Error('Expected the OpenAPI client to retry the selected failure.');
    expect(request.method).toBe('POST');
    expect(new URL(request.url).pathname).toBe('/api/v1/channels/channel-1/ebay/order-failures/failure-1/retry');
  });
});
