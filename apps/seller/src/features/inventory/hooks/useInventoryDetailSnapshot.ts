import { useEffect, useRef, useState } from 'react';
import { getInventoryBySku, type InventorySnapshot } from '../../../api/inventory';

type SnapshotState = 'loading' | 'success' | 'error';

export function useInventoryDetailSnapshot(sku: string) {
  const [requestVersion, setRequestVersion] = useState(0);
  const [state, setState] = useState<SnapshotState>('loading');
  const [snapshot, setSnapshot] = useState<InventorySnapshot | null>(null);
  const [snapshotSku, setSnapshotSku] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const silentRefresh = useRef(false);
  const committedVersion = useRef({ sku, version: -1 });
  if (committedVersion.current.sku !== sku) committedVersion.current = { sku, version: -1 };

  useEffect(() => {
    const controller = new AbortController();
    const keepSnapshot = silentRefresh.current && snapshot !== null && snapshotSku === sku;
    silentRefresh.current = false;
    if (!keepSnapshot) {
      setState('loading');
      setSnapshot(null);
      setSnapshotSku(null);
      setError(null);
    }
    void getInventoryBySku(sku, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      // Versions are scoped to one SKU; never compare balances across different products.
      if (result.version < committedVersion.current.version) {
        setError(new Error('Inventory revalidation returned an older SKU version.'));
        return;
      }
      committedVersion.current.version = result.version;
      setSnapshot(result);
      setSnapshotSku(sku);
      setState('success');
      setError(null);
    }).catch((nextError: unknown) => {
      if (controller.signal.aborted) return;
      // A realtime re-read that fails must not replace a valid balance with an error screen.
      if (keepSnapshot) {
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

  return { error, refresh, revalidate, snapshot, state };
}
