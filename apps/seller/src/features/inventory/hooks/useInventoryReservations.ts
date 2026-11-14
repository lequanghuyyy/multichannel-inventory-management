import { useEffect, useRef, useState } from 'react';
import { listReservations, type Hold } from '../../../api/reservations';

type LoadState = 'loading' | 'success' | 'error';

export function useInventoryReservations(variantId: string) {
  const [state, setState] = useState<LoadState>('loading');
  const [items, setItems] = useState<Hold[]>([]);
  const [activeCount, setActiveCount] = useState<number | undefined>();
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [error, setError] = useState<unknown>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const silentRefresh = useRef(false);
  const hasItems = useRef(false);
  const requestEpoch = useRef(0);

  useEffect(() => {
    if (!variantId) {
      setItems([]);
      setActiveCount(0);
      setNextCursor(undefined);
      setState('success');
      setError(null);
      hasItems.current = true;
      return;
    }
    const controller = new AbortController();
    const epoch = ++requestEpoch.current;
    const keepItems = silentRefresh.current && hasItems.current;
    silentRefresh.current = false;
    if (!keepItems) {
      setState('loading');
      setItems([]);
      setActiveCount(undefined);
      setNextCursor(undefined);
      setError(null);
      hasItems.current = false;
    }
    setLoadingMore(false);
    void listReservations({ limit: 5, status: ['ACTIVE'], variant_id: variantId }, controller.signal).then((page) => {
      if (controller.signal.aborted) return;
      setItems(page.items);
      setActiveCount(page.activeCount);
      hasItems.current = true;
      setNextCursor(page.nextCursor ?? undefined);
      setState('success');
      setError(null);
    }).catch((nextError: unknown) => {
      if (controller.signal.aborted) return;
      setError(nextError);
      if (!keepItems) setState('error');
    });
    return () => {
      controller.abort();
      if (requestEpoch.current === epoch) requestEpoch.current += 1;
    };
  }, [requestVersion, variantId]);

  const refresh = () => {
    silentRefresh.current = false;
    setRequestVersion((value) => value + 1);
  };
  const revalidate = () => {
    silentRefresh.current = true;
    setRequestVersion((value) => value + 1);
  };
  const loadMore = async () => {
    if (!variantId || !nextCursor || loadingMore) return;
    const epoch = requestEpoch.current;
    setLoadingMore(true);
    try {
      const page = await listReservations({ limit: 5, status: ['ACTIVE'], variant_id: variantId, cursor: nextCursor });
      if (epoch !== requestEpoch.current) return;
      setItems((current) => {
        const ids = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !ids.has(item.id))];
      });
      setNextCursor(page.nextCursor ?? undefined);
      setError(null);
    } catch (nextError: unknown) {
      if (epoch === requestEpoch.current) setError(nextError);
    } finally {
      if (epoch === requestEpoch.current) setLoadingMore(false);
    }
  };

  return { activeCount, error, items, loadMore, loadingMore, nextCursor, refresh, revalidate, state };
}
