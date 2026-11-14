import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../core/api-error';
import { executeAllocation, getAllocationExecution, previewAllocation } from './allocations';

const plan = {
  id: '50000000-0000-4000-8000-000000000001',
  variant_id: '20000000-0000-4000-8000-000000000001',
  sku: 'SHOE-001-BLK-41',
  available_to_sell: 7,
  core_version: 7,
  base_allocation_revision: 1,
  allocation_revision: 2,
  policy: { type: 'weighted', weights: { shopify: 2 } },
  status: 'projected',
  can_execute: true,
  issues: [],
  items: [],
  created_at: '2026-11-08T04:00:00Z',
};

const execution = {
  plan_id: plan.id,
  variant_id: plan.variant_id,
  core_version: 7,
  base_allocation_revision: 1,
  allocation_revision: 2,
  status: 'applying',
  phase: 'decreasing',
  can_execute: true,
  created_at: plan.created_at,
  steps: [],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

// These assertions are about the wire contract the allocation workspace relies on: the client
// sends listing ids and policy weights, never a per-listing quantity. The server owns every
// number that reaches a marketplace.
describe('api/allocations', () => {
  it('persists a preview with listing ids and policy weights', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json(plan));
    vi.stubGlobal('fetch', fetchMock);

    await expect(previewAllocation({
      variant_id: plan.variant_id,
      listing_ids: ['60000000-0000-4000-8000-000000000001'],
      weights: { shopify: 2 },
    })).resolves.toEqual(plan);

    const request = fetchMock.mock.calls[0]?.[0] as Request;
    expect(request.method).toBe('POST');
    expect(new URL(request.url).pathname).toBe('/api/v1/inventory/allocations/preview');
    expect(JSON.parse(await request.text())).toEqual({
      variant_id: plan.variant_id,
      listing_ids: ['60000000-0000-4000-8000-000000000001'],
      weights: { shopify: 2 },
    });
  });

  it('omits weights for the saved policy and sends an empty map for an explicit equal split', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json(plan));
    vi.stubGlobal('fetch', fetchMock);

    await previewAllocation({ variant_id: plan.variant_id, listing_ids: ['listing-1'] });
    await previewAllocation({ variant_id: plan.variant_id, listing_ids: ['listing-1'], weights: {} });

    const bodies = await Promise.all(fetchMock.mock.calls.map(async ([request]) => JSON.parse(await (request as Request).text())));
    expect(bodies[0]).not.toHaveProperty('weights');
    expect(bodies[1]).toEqual({ variant_id: plan.variant_id, listing_ids: ['listing-1'], weights: {} });
  });

  it('reads execution progress from the plan id and starts execution with a POST to the same plan', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json(execution))
      .mockResolvedValueOnce(json(execution, 202));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getAllocationExecution(plan.id)).resolves.toEqual(execution);
    await expect(executeAllocation(plan.id)).resolves.toEqual(execution);

    const read = fetchMock.mock.calls[0]?.[0] as Request;
    const start = fetchMock.mock.calls[1]?.[0] as Request;
    expect(read.method).toBe('GET');
    expect(new URL(read.url).pathname).toBe(`/api/v1/inventory/allocations/${plan.id}`);
    expect(start.method).toBe('POST');
    expect(new URL(start.url).pathname).toBe(`/api/v1/inventory/allocations/${plan.id}/execute`);
  });

  it('preserves the structured server refusal instead of turning it into a generic failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({
      error: { code: 'QUOTA_EXCEEDS_ATS', message: 'Quota exceeds available to sell', request_id: 'req-allocation-1' },
    }, 409)));

    await expect(previewAllocation({ variant_id: plan.variant_id, listing_ids: ['listing-1'] }))
      .rejects.toMatchObject({ code: 'QUOTA_EXCEEDS_ATS', requestId: 'req-allocation-1' } satisfies Partial<ApiRequestError>);
  });
});
