import { useEffect, useRef, useState } from 'react';
import { getInventoryReceipts, type SKUReceipt } from '../../../api/inventory';

export type SKUReceiptFilter = 'all' | 'open' | 'history';
type LoadState = 'loading' | 'success' | 'error';

export function useInventorySKUReceipts(sku: string) {
  const [filter, setFilter] = useState<SKUReceiptFilter>('all');
  const [requestVersion, setRequestVersion] = useState(0);
  const [state, setState] = useState<LoadState>('loading');
  const [items, setItems] = useState<SKUReceipt[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [error, setError] = useState<unknown>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const silentRefresh = useRef(false);
  const hasItems = useRef(false);
  const requestEpoch = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const epoch = ++requestEpoch.current;
    const keepItems = silentRefresh.current && hasItems.current;
    silentRefresh.current = false;
    if (!keepItems) {
      setState('loading');
      setItems([]);
      hasItems.current = false;
      setNextCursor(undefined);
      setError(null);
    }
    setLoadingMore(false);
    void getInventoryReceipts(sku, { limit: 20, status: filter }, controller.signal).then((page) => {
      if (controller.signal.aborted) return;
      setItems(page.items);
      hasItems.current = true;
      setNextCursor(page.next_cursor);
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
  }, [filter, requestVersion, sku]);

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
      const page = await getInventoryReceipts(sku, { limit: 20, status: filter, cursor: nextCursor });
      if (epoch !== requestEpoch.current) return;
      setItems((current) => {
        const ids = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !ids.has(item.id))];
      });
      setNextCursor(page.next_cursor);
      setError(null);
    } catch (nextError: unknown) {
      if (epoch === requestEpoch.current) setError(nextError);
    } finally {
      if (epoch === requestEpoch.current) setLoadingMore(false);
    }
  };

  return { error, filter, items, loadMore, loadingMore, nextCursor, revalidate, refresh, setFilter, state };
}
