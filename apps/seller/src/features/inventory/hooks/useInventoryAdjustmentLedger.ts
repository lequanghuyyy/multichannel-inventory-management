import { useEffect, useRef, useState } from 'react';
import { getInventoryAdjustmentLedger, type InventoryAdjustmentLedgerEntry } from '../../../api/inventory';

type LedgerState = 'loading' | 'success' | 'error';

export function useInventoryAdjustmentLedger(sku: string) {
  const [requestVersion, setRequestVersion] = useState(0);
  const [state, setState] = useState<LedgerState>('loading');
  const [entries, setEntries] = useState<InventoryAdjustmentLedgerEntry[]>([]);
  const [entriesSku, setEntriesSku] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const silentRefresh = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const keepEntries = silentRefresh.current && state === 'success' && entriesSku === sku;
    silentRefresh.current = false;
    if (!keepEntries) {
      setState('loading');
      setEntries([]);
      setEntriesSku(null);
      setError(null);
    }
    void getInventoryAdjustmentLedger(sku, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setEntries(result);
      setEntriesSku(sku);
      setState('success');
      setError(null);
    }).catch((nextError: unknown) => {
      if (controller.signal.aborted) return;
      // Keep the last committed ledger visible; a failed refresh is not an empty ledger.
      if (keepEntries) {
        setError(nextError);
        return;
      }
      setError(nextError);
      setState('error');
    });
    return () => controller.abort();
  }, [requestVersion, sku]);

  const refresh = () => {
    silentRefresh.current = false;
    setRequestVersion((value) => value + 1);
  };
  const revalidate = () => {
    silentRefresh.current = true;
    setRequestVersion((value) => value + 1);
  };

  return { entries, error, refresh, revalidate, state };
}
