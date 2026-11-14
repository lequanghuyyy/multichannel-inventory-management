import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Page } from '../../api/list';
import { ApiRequestError } from '../../core/api-error';
import { useApiPage, type FixtureLoader } from './useApiPage';

afterEach(cleanup);

function page<T>(items: T[], nextCursor: string | null = null): Page<T> {
  return nextCursor === null ? { items, nextCursor: null } : { items, nextCursor };
}

const rows = (n: number, prefix: string) => Array.from({ length: n }, (_, index) => `${prefix}-${index}`);

describe('useApiPage', () => {
  it('resets to page one and ignores a stale response when requestKey changes', async () => {
    let resolveOld!: (value: Page<{ id: string }>) => void;
    const loader = vi.fn((_cursor: string | null, signal: AbortSignal) => signal.aborted
      ? Promise.reject(new DOMException('aborted', 'AbortError'))
      : new Promise<Page<{ id: string }>>((resolve) => { resolveOld = resolve; }));
    const { result, rerender } = renderHook(({ key }) => useApiPage(loader, async () => [], 'default', 50, { requestKey: key, getRowKey: (row) => row.id }), { initialProps: { key: 'old' } });
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    loader.mockResolvedValueOnce(page([{ id: 'new' }]));
    rerender({ key: 'new' });
    await waitFor(() => expect(result.current.rows).toEqual([{ id: 'new' }]));
    await act(async () => { resolveOld(page([{ id: 'stale' }])); await Promise.resolve(); });
    expect(result.current.rows).toEqual([{ id: 'new' }]);
    expect(loader).toHaveBeenLastCalledWith(null, expect.any(AbortSignal));
  });

  it('deduplicates a retried next page and clears its previous error', async () => {
    const loader = vi.fn()
      .mockResolvedValueOnce(page([{ id: 'a' }], 'c1'))
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce(page([{ id: 'a' }, { id: 'b' }]));
    const { result } = renderHook(() => useApiPage(loader, async () => [], 'default', 50, { getRowKey: (row: { id: string }) => row.id }));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.loadingMore).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.rows).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(result.current.hasMore).toBe(false);
  });

  it('can fail closed without reading a fixture', async () => {
    const fixture = vi.fn(async () => ['fixture']);
    const { result } = renderHook(() => useApiPage(async () => { throw new Error('offline'); }, fixture, 'default', 50, { fallbackOnError: false }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.source).toBe('pending');
    expect(result.current.fixtureError).toBeInstanceOf(Error);
    expect(fixture).not.toHaveBeenCalled();
  });

  it('retries a cold API failure on revalidation and timestamps only a successful snapshot', async () => {
    const loader = vi.fn<(_cursor: string | null, _signal: AbortSignal) => Promise<Page<string>>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(page(['backend-v3']));
    const { result } = renderHook(() => useApiPage(loader, async () => [], 'default', 50, {
      fallbackOnError: false,
      pendingUntilResolved: true,
    }));

    await waitFor(() => expect(result.current.fixtureError).toBeInstanceOf(Error));
    expect(result.current.source).toBe('pending');
    expect(result.current.apiUpdatedAt).toBeNull();

    act(() => result.current.revalidate());
    await waitFor(() => expect(result.current.rows).toEqual(['backend-v3']));
    expect(result.current.source).toBe('api');
    expect(result.current.apiUpdatedAt).toMatch(/^\d{4}-\d\d-/);
  });
  it('reports live rows when the API answers', async () => {
    const loader = vi.fn(async () => page(['a', 'b']));
    const loadFixture = vi.fn<FixtureLoader<string>>(async () => ['fixture']);
    const { result } = renderHook(() => useApiPage(loader, loadFixture, 'default'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.source).toBe('api');
    expect(result.current.rows).toEqual(['a', 'b']);
    expect(loadFixture).not.toHaveBeenCalled();
  });

  it('falls back to the fixture and says so', async () => {
    // The fallback is the whole point: the screen keeps working when the API is down, and the
    // reader can tell. A fallback that rendered live-looking numbers would be a lie.
    const loader = vi.fn(async () => { throw new Error('offline'); });
    const loadFixture = vi.fn<FixtureLoader<string>>(async () => ['fixture-1']);
    const { result } = renderHook(() => useApiPage(loader, loadFixture, 'default'));

    // Wait on the ROWS, not on the source. `source` reaches 'fixture' the instant the API
    // fails — before the fixture read resolves — so waiting on it can observe a screen
    // labelled "Dữ liệu mẫu" holding nothing at all. That race is why the assertion below
    // reads the rows, and why the fallback test in `re-runs the fixture after a refresh
    // recovers` has to wait on the same thing.
    await waitFor(() => expect(result.current.rows).toEqual(['fixture-1']));
    expect(result.current.source).toBe('fixture');
    expect(result.current.error).toBeInstanceOf(Error);
    // The fallback succeeded, so there is nothing further to report — an error banner over
    // working rows would claim a failure that did not happen.
    expect(result.current.fixtureError).toBeNull();
  });

  it('does not claim the API has failed before it has', () => {
    // The distinction that matters: on the first render nothing has loaded, and the screen
    // must not already be labelled "fixture". A badge that appears for the duration of every
    // cold load is a badge the reader learns to ignore on live pages too.
    const loader = vi.fn(async (): Promise<Page<string>> => page(['a']));
    const { result } = renderHook(() => useApiPage(loader, () => Promise.resolve(['f']), 'default'));
    expect(result.current.loading).toBe(true);
    expect(result.current.rows).toEqual([]);
  });

  it('reports both failures when the fixture also fails', async () => {
    const loader = vi.fn(async () => { throw new Error('api down'); });
    const loadFixture = vi.fn<FixtureLoader<string>>(async () => { throw new Error('fixture down'); });
    const { result } = renderHook(() => useApiPage(loader, loadFixture, 'default'));

    await waitFor(() => expect(result.current.fixtureError).toBeInstanceOf(Error));
    expect(result.current.rows).toEqual([]);
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('does not claim more pages on the fixture', async () => {
    // Fixture lists are whole arrays with no cursor. Offering "load more" over them would
    // append nothing and leave a button that lies.
    const loader = vi.fn(async () => { throw new Error('offline'); });
    const { result } = renderHook(() => useApiPage(loader, async () => ['x'], 'default'));

    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.hasMore).toBe(false);
  });

  it('accumulates pages instead of replacing them', async () => {
    const loader = vi.fn(async (cursor: string | null) => (cursor === null ? page(['a', 'b'], 'c1') : page(['c', 'd'], 'c2')));
    // Declared OUTSIDE the callback on purpose: an inline loader is a fresh arrow on every
    // render, and if it were a dependency the page would refetch in a loop forever. The fact
    // that this suite passes at all is the regression guard for that.
    const loadFixture = vi.fn<FixtureLoader<string>>(async () => []);
    const { result } = renderHook(() => useApiPage(loader, loadFixture, 'default'));

    await waitFor(() => expect(result.current.hasMore).toBe(true));
    expect(result.current.rows).toEqual(['a', 'b']);

    await act(async () => { result.current.loadMore(); });
    // The bug this pins: an effect keyed on the cursor refetches page 1, so "load more" would
    // leave the reader exactly where they started with page 1 on screen twice.
    expect(result.current.rows).toEqual(['a', 'b', 'c', 'd']);
    expect(loader).toHaveBeenNthCalledWith(2, 'c1', expect.any(AbortSignal));
  });

  it('does not refetch in a loop when the loaders are inline arrows', async () => {
    // The realistic call site: `useApiPage((c, s) => listInventory(..., s), getRows, mode)`.
    // Both arguments are new objects on every render, which is exactly what React compares.
    const loader = vi.fn(async (): Promise<Page<string>> => page(['a']));
    const { result } = renderHook(() => useApiPage(loader, () => Promise.resolve(['f']), 'default'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await Promise.resolve(); });
    // One fetch per mount. A dependency array naming either loader would make this count
    // climb without bound, and the page would never settle.
    expect(loader).toHaveBeenCalledTimes(1);
    expect(result.current.rows).toEqual(['a']);
  });

  it('stops offering pages once the last page omits next_cursor', async () => {
    // next_cursor is OMITTED, not null, on the final page — treating "absent" and "more" as
    // the same thing is how a list screen ends up with a permanently enabled Next button.
    const loader = vi.fn(async (cursor: string | null) => (cursor === null ? page(['a'], 'c1') : page(['b'])));
    const loadFixture = vi.fn<FixtureLoader<string>>(async () => []);
    const { result } = renderHook(() => useApiPage(loader, loadFixture, 'default'));

    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(async () => { result.current.loadMore(); });
    await waitFor(() => expect(result.current.hasMore).toBe(false));
    expect(result.current.rows).toEqual(['a', 'b']);
  });

  it('keeps the rows already shown when loading another page fails', async () => {
    let call = 0;
    const loader = vi.fn(async (): Promise<Page<string>> => {
      call += 1;
      if (call === 1) return page(['a', 'b'], 'c1');
      throw new Error('page two failed');
    });
    const loadFixture = vi.fn<FixtureLoader<string>>(async () => ['fixture']);
    const { result } = renderHook(() => useApiPage(loader, loadFixture, 'default'));

    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(async () => { result.current.loadMore(); });
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));

    // Page one was correct when it arrived and is still correct. Throwing it away would punish
    // the reader for the second page's failure — and flipping the badge to "fixture" would be
    // a lie, because these are still live numbers.
    expect(result.current.rows).toEqual(['a', 'b']);
    expect(result.current.source).toBe('api');
  });

  it('ignores a loadMore with no cursor', async () => {
    const loader = vi.fn(async () => page(['a']));
    const loadFixture = vi.fn<FixtureLoader<string>>(async () => []);
    const { result } = renderHook(() => useApiPage(loader, loadFixture, 'default'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { result.current.loadMore(); });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('re-reads the fixture on refresh after a failure', async () => {
    // The declared return type matters: an arrow that only throws infers `Promise<never>`,
    // and `mockResolvedValueOnce` on a `never` mock is a type error — which would push the
    // recovery case (the one that matters most) out of the suite.
    const loader = vi.fn(async (): Promise<Page<string>> => { throw new Error('offline'); });
    const loadFixture = vi.fn<FixtureLoader<string>>(async () => ['fixture']);
    const { result } = renderHook(() => useApiPage(loader, loadFixture, 'default'));

    await waitFor(() => expect(result.current.rows).toEqual(['fixture']));
    await act(async () => { result.current.refresh(); });
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(2));

    // Retry must be able to RECOVER, not just re-render the fallback.
    loader.mockResolvedValueOnce(page(['live']));
    await act(async () => { result.current.refresh(); });
    await waitFor(() => expect(result.current.source).toBe('api'));
    expect(result.current.rows).toEqual(['live']);
  });

  it('starts from page one when the fixture list is returned', async () => {
    const loader = vi.fn(async () => { throw new Error('offline'); });
    const { result } = renderHook(() => useApiPage(loader, async () => rows(7, 'f'), 'default'));

    await waitFor(() => expect(result.current.rows).toHaveLength(7));
    expect(result.current.source).toBe('fixture');
  });
});

// A 4xx is an answer, not an outage.
//
describe('useApiPage revalidation', () => {
  it('keeps live rows on screen while a background re-read is pending', async () => {
    let resolveRefresh!: (value: Page<string>) => void;
    const loader = vi.fn()
      .mockResolvedValueOnce(page(['old']))
      .mockImplementationOnce(() => new Promise<Page<string>>((resolve) => { resolveRefresh = resolve; }));
    const { result } = renderHook(() => useApiPage(loader, async () => [], 'default'));

    await waitFor(() => expect(result.current.rows).toEqual(['old']));
    act(() => result.current.revalidate());
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(2));

    expect(result.current.loading).toBe(false);
    expect(result.current.rows).toEqual(['old']);
    expect(result.current.source).toBe('api');

    await act(async () => {
      resolveRefresh(page(['new']));
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.rows).toEqual(['new']));
  });

  it('does not replace live rows with the fixture when a revalidation fails', async () => {
    const loadFixture = vi.fn<FixtureLoader<string>>(async () => ['fixture']);
    const loader = vi.fn()
      .mockResolvedValueOnce(page(['live']))
      .mockRejectedValueOnce(new Error('network down'));
    const { result } = renderHook(() => useApiPage(loader, loadFixture, 'default'));

    await waitFor(() => expect(result.current.rows).toEqual(['live']));
    await act(async () => { result.current.revalidate(); });
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(2));

    expect(result.current.rows).toEqual(['live']);
    expect(result.current.source).toBe('api');
    expect(loadFixture).not.toHaveBeenCalled();
  });
});

// These two cases are the reason the hook carries the HTTP status at all. Before it did, a
// 404 and a dropped connection were the same event to this code, so a detail page answered
// "this order does not exist" by showing the prototype's row for a DIFFERENT id under the
// same URL. The page looked fine and was wrong, which is the only failure mode this project's
// two-source rule exists to prevent.
describe('useApiPage · client errors', () => {
  const notFound = () => new ApiRequestError(
    { code: 'ORDER_NOT_FOUND', message: 'Order was not found', request_id: 'req-1' },
    404,
  );

  it('does not fall back to the fixture after a 404', async () => {
    const loader = vi.fn(async () => { throw notFound(); });
    const loadFixture = vi.fn<FixtureLoader<string>>(async () => ['fixture-1']);
    const { result } = renderHook(() => useApiPage(loader, loadFixture, 'default'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(loadFixture).not.toHaveBeenCalled();
    expect(result.current.rows).toEqual([]);
    // Reported as the fixture's own failure, which is the branch a screen renders an error
    // block from. "There is nothing here" would be a different and wrong claim.
    expect(result.current.fixtureError).toBeInstanceOf(ApiRequestError);
  });

  it('still falls back when the server could not answer', async () => {
    const loader = vi.fn(async () => {
      throw new ApiRequestError({ code: 'ORDERS_UNAVAILABLE', message: 'unavailable', request_id: 'req-2' }, 503);
    });
    const loadFixture = vi.fn<FixtureLoader<string>>(async () => ['fixture-1']);
    const { result } = renderHook(() => useApiPage(loader, loadFixture, 'default'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(loadFixture).toHaveBeenCalled();
    expect(result.current.source).toBe('fixture');
    expect(result.current.rows).toEqual(['fixture-1']);
  });

  it('treats an error with no status as unknown and falls back', async () => {
    // Zero means "constructed without a response", not "succeeded". Defaulting the other way
    // would leave a screen permanently blank the first time a caller built the error itself.
    const loader = vi.fn(async () => {
      throw new ApiRequestError({ code: 'VALIDATION_ERROR', message: 'bad', request_id: 'req-3' });
    });
    const loadFixture = vi.fn<FixtureLoader<string>>(async () => ['fixture-1']);
    const { result } = renderHook(() => useApiPage(loader, loadFixture, 'default'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.source).toBe('fixture');
  });
});
