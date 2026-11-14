import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiRequestError } from '../../core/api-error';
import type { Page } from '../../api/list';
import type { DemoMode } from '../../mocks/mock-api';

export type DataSource = 'pending' | 'api' | 'fixture';

/**
 * Fetches one page from the API, keyed by cursor.
 *
 * This mirrors `useInventoryDetailSnapshot`, which is the pattern the wired screens already
 * follow: on success the live value wins, on failure it is set back to null so the fixture
 * baseline shows through instead of a stale or half-filled row. The important detail is that
 * a failed page REPLACES the rows rather than appending to them — a screen showing page 1 of
 * live data beside page 2 of fixture data would be mixing two inventories, and every number on
 * it would be a guess.
 */
export type ApiPageLoader<T> = (cursor: string | null, signal: AbortSignal) => Promise<Page<T>>;

/** The existing fixture loaders already have this shape — see `mocks/mock-api.ts`. */
export type FixtureLoader<T> = (mode: DemoMode) => Promise<T[]>;

export interface ApiPage<T> {
  rows: T[];
  /** True only while a page that follows a successful one is in flight. */
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: unknown;
  /** Set only when the fixture fallback ALSO failed; otherwise the screen still has rows. */
  fixtureError: unknown;
  source: DataSource;
  /** Wall-clock time at which page one was last accepted from the API. */
  apiUpdatedAt: string | null;
  /** Increments only when a page-one API snapshot has been accepted. */
  apiSnapshotVersion: number;
  totalCount: number | null;
  statusCounts: Record<string, number> | null;
  refresh: () => void;
  /**
   * Re-reads page one without clearing the rows already on screen.
   *
   * Realtime notifications and degraded-mode polling call this instead of `refresh`: a
   * background re-read must not blank the page, flash a spinner, or swap live rows for the
   * fixture because one request failed. A revalidation only replaces the rows when the API
   * actually answers.
   */
  revalidate: () => void;
  loadMore: () => void;
}

export interface ApiPageOptions<T> {
  /** Refetches page one and invalidates every older response when this value changes. */
  requestKey?: string | number | boolean | null;
  /** Detail reads use false so an outage cannot substitute a different fixture entity. */
  fallbackOnError?: boolean;
  /** Prevents overlapping cursor pages from duplicating an entity. */
  getRowKey?: (row: T) => string;
  /** Live catalog/detail screens must not label the first pending render as fixture. */
  pendingUntilResolved?: boolean;
}

/**
 * `TFixture` defaults to `TApi` because most screens project their API rows into the very
 * shape the fixture already had, and one type parameter is then enough.
 *
 * It has to be parameterisable at all because a screen whose two sources genuinely disagree —
 * the products catalogue, where the fixture carries variants, prices and channel bindings and
 * `ProductSummary` carries none of them — cannot render both through a single projection. The
 * alternative, casting the fallback into the API shape, would make the fixture screen print
 * empty cells for every field it was actually full of.
 */
export function useApiPage<TApi, TFixture = TApi>(
  loader: ApiPageLoader<TApi>,
  loadFixture: FixtureLoader<TFixture>,
  mode: DemoMode,
  limit = 50,
  options: ApiPageOptions<TApi | TFixture> = {},
): ApiPage<TApi | TFixture> {
  const fallbackOnError = options.fallbackOnError ?? true;
  const [rows, setRows] = useState<(TApi | TFixture)[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [fixtureError, setFixtureError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Held as state rather than derived from `rows !== null`, because "not loaded yet" and "the
  // API failed" both leave rows null. Deriving it would label the very first render as
  // fixture — putting a "Dữ liệu mẫu" badge over a screen that is still loading, and racing
  // the fixture read so a caller can observe 'fixture' with no fixture rows on it.
  const [source, setSource] = useState<DataSource>(options.pendingUntilResolved || options.fallbackOnError === false ? 'pending' : 'fixture');
  const [apiUpdatedAt, setApiUpdatedAt] = useState<string | null>(null);
  const [apiSnapshotVersion, setApiSnapshotVersion] = useState(0);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [statusCounts, setStatusCounts] = useState<Record<string, number> | null>(null);

  // The loaders are held in refs rather than listed as effect dependencies. Both are inline
  // arrows at the call site (`(cursor, signal) => listInventory(...)`), so their identity
  // changes on every render; depending on them would refetch in a loop, each response
  // re-rendering the page and minting the next arrow. Refetching is therefore EXPLICIT —
  // refresh() for a retry, or a changed `mode`/`limit` — and a caller whose loader needs to
  // react to new input calls refresh() when that input changes.
  const loaderRef = useRef(loader);
  const fixtureRef = useRef(loadFixture);
  const keyOfRef = useRef(options.getRowKey);
  loaderRef.current = loader;
  fixtureRef.current = loadFixture;
  keyOfRef.current = options.getRowKey;

  // Mirrors the cursor so loadMore can read it without re-subscribing the fetch effect to a
  // value that changes on every page.
  const cursorRef = useRef<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  // `source` is read through a ref because adding it to the fetch effect's dependencies would
  // refetch every time the source label changed. Only a silent revalidation needs it, and it
  // must only preserve rows that are actually live API rows.
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const silentRefresh = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    inFlight.current?.abort();
    inFlight.current = controller;
    const keepRows = silentRefresh.current && sourceRef.current === 'api' && rowsRef.current !== null;
    silentRefresh.current = false;
    if (!keepRows) {
      setLoading(true);
      setLoadingMore(false);
      setError(null);
      setFixtureError(null);
      setRows(null);
      setTotalCount(null);
      setStatusCounts(null);
      setCursor(null);
      if (options.pendingUntilResolved || fallbackOnError === false) setSource('pending');
      cursorRef.current = null;
    }

    // An explicit demo mode is an instruction, not a preference. `?demo=error` exists to show
    // the failure state on a machine whose API is perfectly healthy — if the real request ran
    // first it would answer 200, the screen would fill with live rows, and the mode would
    // silently do nothing. So the fixture answers, and the API is not called at all.
    if (mode !== 'default') {
      void Promise.resolve().then(() => fixtureRef.current(mode)).then((fallback) => {
        if (controller.signal.aborted) return;
        setRows(fallback);
        setSource('fixture');
      }).catch((fixtureReason: unknown) => {
        if (controller.signal.aborted) return;
        setRows([]);
        // setFixtureError, not setError: the failure came from the fixture, and that is the
        // slot the screens read to decide whether the DATA source is broken as opposed to
        // the API call being flaky. A page showing the API error slot here would offer a
        // retry that re-runs the API, which is not what failed.
        setFixtureError(fixtureReason);
      }).finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
      // The spinner has to be cleared on this path too: returning early from the effect
      // skips the shared `setLoading(false)` further down, and a screen that spins for ever
      // is indistinguishable from a screen that is still working.
      // Loading ends only after the asynchronous fixture request settles.
      return;
    }

    // Wrapped so a loader that throws SYNCHRONOUSLY is handled the same as one that returns
    // a rejected promise. `loader(...).then(...)` only catches the latter: a synchronous throw
    // escapes before `.then` exists, skips every handler below, and leaves `loading` true for
    // ever — a screen that shows its spinner until the tab is closed, with no error anywhere.
    // `Promise.resolve().then(...)` turns the call into a rejection the chain already knows
    // how to route to the fixture fallback.
    void Promise.resolve().then(() => loaderRef.current(null, controller.signal)).then((result) => {
      if (controller.signal.aborted) return;
      cursorRef.current = result.nextCursor;
      setCursor(result.nextCursor);
      setRows(result.items);
      setTotalCount(result.totalCount ?? null);
      setStatusCounts(result.statusCounts ?? null);
      setSource('api');
      if (cursor === null) {
        setApiUpdatedAt(new Date().toISOString());
        setApiSnapshotVersion((version) => version + 1);
      }
      setError(null);
      setFixtureError(null);
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return;
      // A failed background re-read is not evidence that the rows on screen are wrong. They
      // stay; the realtime status and the next successful poll report the recovery.
      if (keepRows) {
        setError(reason);
        return;
      }
      // null, not the previous rows: this is what makes the fixture visible below.
      setRows(null);
      setError(reason);
      // A 4xx is an ANSWER, not an outage. Falling back to the prototype baseline after a 404
      // would put a different record on screen under the id the caller asked for, with nothing
      // on the page saying so — and on a detail screen that is the worst possible outcome,
      // because the URL and the contents disagree. 5xx and transport failures still fall back:
      // there the server could not answer, and the fixture is strictly better than a blank
      // screen.
      if (!fallbackOnError || (reason instanceof ApiRequestError && reason.isClientError)) {
        setFixtureError(reason);
        return;
      }
      void Promise.resolve().then(() => fixtureRef.current(mode)).then((fallback) => {
        if (controller.signal.aborted) return;
        setRows(fallback);
        setSource('fixture');
      }).catch((fixtureReason: unknown) => {
        if (controller.signal.aborted) return;
        // Source stays on the fixture it is already showing. If there were never any rows
        // there is nothing to misrepresent, and 'api' would claim a live page that failed.
        setFixtureError(fixtureReason);
      });
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });

    return () => {
      controller.abort();
      inFlight.current?.abort();
    };
  }, [attempt, fallbackOnError, limit, mode, options.pendingUntilResolved, options.requestKey]);

  // loadMore installs its own controller, so the effect's cleanup — which only knows about
  // the controller it created — would not abort it. Without this an unmount mid-"load more"
  // leaves a request running and calling setState on a gone component.
  useEffect(() => () => { inFlight.current?.abort(); }, []);

  const refresh = useCallback(() => {
    silentRefresh.current = false;
    setAttempt((value) => value + 1);
  }, []);

  const revalidate = useCallback(() => {
    silentRefresh.current = true;
    setAttempt((value) => value + 1);
  }, []);

  const loadMore = useCallback(() => {
    const next = cursorRef.current;
    if (!next || loadingMore) return;
    const controller = new AbortController();
    inFlight.current?.abort();
    inFlight.current = controller;
    setLoadingMore(true);
    setError(null);
    // Same reason as the initial load above: a synchronous throw here would strand
    // `loadingMore` on and never surface the error.
    void Promise.resolve().then(() => loaderRef.current(next, controller.signal)).then((result) => {
      if (controller.signal.aborted) return;
      cursorRef.current = result.nextCursor;
      setCursor(result.nextCursor);
      setError(null);
      setRows((current) => {
        if (current === null) return result.items;
        const keyOf = keyOfRef.current;
        if (!keyOf) return [...current, ...result.items];
        const seen = new Set(current.map(keyOf));
        return [...current, ...result.items.filter((row) => !seen.has(keyOf(row)))];
      });
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return;
      // The pages already shown stay. Dropping them would punish the reader for a failed
      // "load more" and throw away rows that are still correct.
      setError(reason);
    }).finally(() => {
      if (!controller.signal.aborted) setLoadingMore(false);
    });
  }, [loadingMore]);

  return {
    rows: rows ?? [],
    hasMore: source === 'api' && cursor !== null,
    loading,
    loadingMore,
    error,
    fixtureError,
    // A page that resolved is live data; anything else is the fixture baseline or nothing yet.
    // The badge and the numbers can never disagree, because both read this one field.
    source,
    apiUpdatedAt,
    apiSnapshotVersion,
    totalCount,
    statusCounts,
    refresh,
    revalidate,
    loadMore,
  };
}
