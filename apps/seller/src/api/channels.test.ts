import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../core/api-error';
import { getChannel, listChannelMappings, listChannels } from './channels';

const channel = {
  id: '30000000-0000-4000-8000-000000000001',
  code: 'shop-a',
  name: 'Simulator A',
  type: 'marketplace',
  environment: 'simulated',
  status: 'connected',
  mapping_count: 2,
};

const mapping = {
  id: '40000000-0000-4000-8000-000000000001',
  channel_id: channel.id,
  variant_id: '20000000-0000-4000-8000-000000000001',
  external_sku: 'SKU-A-001',
  canonical_sku: 'SHOE-001-BLK-41',
  listed: true,
  variant_is_active: true,
  pushed_version: 7,
  pushed_on_hand: 12,
  reported_on_hand: 12,
  pushed_quantity: 11,
  reported_quantity: 11,
  quantity_basis: 'ats',
  legacy_on_hand: null,
  core_on_hand: 12,
  core_reserved: 1,
  core_safety_buffer: 0,
  core_version: 7,
  drifted: false,
  push_state: 'current',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

// These four assertions are deliberately about the WIRE shape the screens depend on: the
// response key, the nullable numbers, and the HTTP status on a typed error. The semantics
// live in the channels module's own Go tests; restating them here would prove the same thing
// twice while checking none of the reconciliation.
describe('api/channels', () => {
  it('reads the channels list from its own response key', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({ channels: [channel], next_cursor: null }));
    vi.stubGlobal('fetch', fetchMock);

    const page = await listChannels({ limit: 10 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.environment).toBe('simulated');
    expect(page.items[0]?.mapping_count).toBe(2);
    expect(page.nextCursor).toBeNull();
    // The client passes a Request object, so the URL is read from it rather than stringified:
    // String(request) is '[object Request]' and asserting against that would pass for any URL.
    const input = fetchMock.mock.calls[0]?.[0];
    expect(input).toBeInstanceOf(Request);
    const requested = input as Request;
    expect(requested.url).toContain('/api/v1/channels');
    expect(requested.method).toBe('GET');
  });

  it('preserves a self-hosted WooCommerce development environment on the channel wire contract', async () => {
    const woocommerce = { ...channel, id: '30000000-0000-4000-8000-000000000004', code: 'woocommerce', name: 'WooCommerce Development Store', type: 'website', environment: 'development', status: 'connected' };
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => json({ channels: [woocommerce] })));
    const page = await listChannels();
    expect(page.items[0]).toMatchObject({ code: 'woocommerce', type: 'website', environment: 'development', status: 'connected' });
  });

  it('reads one channel', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(channel)));
    expect((await getChannel(channel.id)).code).toBe('shop-a');
  });

  it('reads the mapping ledger with all three reconciliation numbers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ mappings: [mapping], next_cursor: null })));
    const page = await listChannelMappings(channel.id);
    const row = page.items[0];
    expect(row?.core_on_hand).toBe(12);
    expect(row?.pushed_on_hand).toBe(12);
    expect(row?.reported_on_hand).toBe(12);
    expect(row?.push_state).toBe('current');
  });

  it('keeps mapping and issue pagination cursors independent', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({
      mappings: [mapping],
      next_cursor: 'mapping-next',
      total_count: 150,
      issues: [{ external_variant_id: 'gid://shopify/ProductVariant/7001', external_product_id: 'gid://shopify/Product/8001', sku: 'BAD-SKU', reason: 'mapping_conflict', last_seen_at: '2026-10-27T08:00:00Z' }],
      issue_count: 31,
      next_issue_cursor: 'issue-next',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const page = await listChannelMappings(channel.id, { limit: 100, cursor: 'mapping-cursor', issue_cursor: 'issue-cursor' });
    expect(page.totalCount).toBe(150);
    expect(page.nextCursor).toBe('mapping-next');
    expect(page.issues[0]?.reason).toBe('mapping_conflict');
    expect(page.issueCount).toBe(31);
    expect(page.nextIssueCursor).toBe('issue-next');
    const request = fetchMock.mock.calls[0]?.[0] as Request;
    const url = new URL(request.url);
    expect(url.searchParams.get('cursor')).toBe('mapping-cursor');
    expect(url.searchParams.get('issue_cursor')).toBe('issue-cursor');
  });

  it('carries the ATS quantity pair and the basis telling which pair to read', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ mappings: [mapping], next_cursor: null })));
    const row = (await listChannelMappings(channel.id)).items[0];
    // 12 on_hand less 1 held is 11 sellable: pushed/reported on the ATS basis, not the gross
    // on_hand. The two pairs coexist and quantity_basis is what decides which one is compared.
    expect(row?.pushed_quantity).toBe(11);
    expect(row?.reported_quantity).toBe(11);
    expect(row?.quantity_basis).toBe('ats');
  });

  it('keeps a nullable core quantity as null rather than zero', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({
      mappings: [{ ...mapping, core_on_hand: null, core_reserved: null, core_safety_buffer: null, core_version: null }],
    })));
    const page = await listChannelMappings(channel.id);
    // Zero would render exactly like a sold-out variant and the reconciliation would hide the
    // broken row it exists to find.
    expect(page.items[0]?.core_on_hand).toBeNull();
  });

  it('carries the HTTP status on a typed error so a 404 is not mistaken for an outage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(
      { error: { code: 'CHANNEL_NOT_FOUND', message: 'Channel was not found', request_id: 'req-1' } },
      404,
    )));
    const error = await getChannel(channel.id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).status).toBe(404);
    expect((error as ApiRequestError).isClientError).toBe(true);
  });
});
