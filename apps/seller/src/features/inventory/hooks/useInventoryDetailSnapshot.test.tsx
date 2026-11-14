import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getInventoryBySku } from '../../../api/inventory';
import { useInventoryDetailSnapshot } from './useInventoryDetailSnapshot';

vi.mock('../../../api/inventory', () => ({ getInventoryBySku: vi.fn() }));

const skuA = { sku: 'SKU-A', variant_id: 'variant-a', version: 9 } as Awaited<ReturnType<typeof getInventoryBySku>>;
const skuB = { sku: 'SKU-B', variant_id: 'variant-b', version: 2 } as Awaited<ReturnType<typeof getInventoryBySku>>;

afterEach(() => vi.clearAllMocks());

describe('useInventoryDetailSnapshot request ordering', () => {
  it('keeps the newest response when an older request settles later', async () => {
    let resolveOld!: (value: typeof skuA) => void;
    vi.mocked(getInventoryBySku)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(skuA)
      .mockResolvedValueOnce({ ...skuA, version: 8 });

    const { result, unmount } = renderHook(() => useInventoryDetailSnapshot('SKU-A'));
    await waitFor(() => expect(getInventoryBySku).toHaveBeenCalledTimes(1));
    act(() => result.current.revalidate());
    await waitFor(() => expect(result.current.snapshot?.version).toBe(9));
    await act(async () => { resolveOld({ ...skuA, version: 3 }); });
    expect(result.current.snapshot?.version).toBe(9);

    act(() => result.current.revalidate());
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.snapshot?.version).toBe(9);
    expect(result.current.state).toBe('success');
    unmount();
  });

  it('does not compare versions across SKUs and aborts on unmount', async () => {
    vi.mocked(getInventoryBySku).mockResolvedValueOnce({ ...skuA, version: 20 }).mockResolvedValueOnce(skuB);
    const { result, rerender, unmount } = renderHook(({ sku }) => useInventoryDetailSnapshot(sku), { initialProps: { sku: 'SKU-A' } });
    await waitFor(() => expect(result.current.snapshot?.version).toBe(20));
    rerender({ sku: 'SKU-B' });
    await waitFor(() => expect(result.current.snapshot?.version).toBe(2));
    expect(result.current.state).toBe('success');
    unmount();
    expect(vi.mocked(getInventoryBySku).mock.calls[1]?.[1]?.aborted).toBe(true);
  });
});
