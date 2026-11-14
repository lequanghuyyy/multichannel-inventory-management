import { useEffect, useRef, useState } from 'react';
import { getInventoryMovements, type InventoryMovement, type InventoryMovementQuery } from '../../../api/inventory';

type LoadState = 'loading' | 'success' | 'error';
type MovementFilters = Pick<InventoryMovementQuery, 'operation_group' | 'from' | 'to'>;

export function useInventoryMovements(sku: string, enabled = true) {
  const [filters, setFilters] = useState<MovementFilters>({});
  const [requestVersion, setRequestVersion] = useState(0);
  const [state, setState] = useState<LoadState>('loading');
  const [entries, setEntries] = useState<InventoryMovement[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [error, setError] = useState<unknown>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const silentRefresh = useRef(false);
  const hasEntries = useRef(false);
  const requestEpoch = useRef(0);

  useEffect(() => {
    const epoch = ++requestEpoch.current;
    if (!enabled) return;
    const controller = new AbortController();
    const keepEntries = silentRefresh.current && hasEntries.current;
    silentRefresh.current = false;
    if (!keepEntries) {
      setState('loading');
      setEntries([]);
      hasEntries.current = false;
      setNextCursor(undefined);
      setError(null);
    }
    setLoadingMore(false);
    void getInventoryMovements(sku, { limit: 25, ...filters }, controller.signal).then((page) => {
      if (controller.signal.aborted) return;
      setEntries(page.items);
      hasEntries.current = true;
      setNextCursor(page.next_cursor);
      setState('success');
      setError(null);
    }).catch((nextError: unknown) => {
      if (controller.signal.aborted) return;
      setError(nextError);
      if (!keepEntries) setState('error');
    });
    return () => {
      controller.abort();
      if (requestEpoch.current === epoch) requestEpoch.current += 1;
    };
  }, [enabled, filters, requestVersion, sku]);

  const refresh = () => {
    silentRefresh.current = false;
    setRequestVersion((value) => value + 1);
  };
  const revalidate = () => {
    silentRefresh.current = true;
    setRequestVersion((value) => value + 1);
  };
  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    const epoch = requestEpoch.current;
    setLoadingMore(true);
    try {
      const page = await getInventoryMovements(sku, { limit: 25, ...filters, cursor: nextCursor });
      if (epoch !== requestEpoch.current) return;
      setEntries((current) => {
        const ids = new Set(current.map((entry) => entry.id));
        return [...current, ...page.items.filter((entry) => !ids.has(entry.id))];
      });
      setNextCursor(page.next_cursor);
      setError(null);
    } catch (nextError: unknown) {
      if (epoch === requestEpoch.current) setError(nextError);
    } finally {
      if (epoch === requestEpoch.current) setLoadingMore(false);
    }
  };

  return { entries, error, filters, loadingMore, loadMore, nextCursor, refresh, revalidate, setFilters, state };
}
