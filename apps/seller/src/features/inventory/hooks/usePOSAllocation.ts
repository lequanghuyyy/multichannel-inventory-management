import { useCallback, useEffect, useState } from 'react';
import { getInventoryBySku, type InventorySnapshot } from '../../../api/inventory';

export type POSAllocationSnapshot = {
  on_hand: number;
  reserved: number;
  safety_buffer: number;
  available_to_sell: number;
  version: number;
  pos_mode: 'shared' | 'dedicated';
  desired_pos_mode: 'shared' | 'dedicated';
  desired_pos_quota: number;
  active_pos_quota: number;
  pos_remaining: number;
  pos_revision: number;
  pos_transition_state: 'stable' | 'pending';
  pos_sellable: number;
  online_budget: number;
};

function toPOSAllocationSnapshot(row: InventorySnapshot): POSAllocationSnapshot {
  const on_hand = row.on_hand ?? 0;
  const reserved = row.reserved ?? 0;
  const safety_buffer = row.safety_buffer ?? 0;
  const available_to_sell = row.available_to_sell ?? 0;
  const version = row.version ?? 1;

  return {
    on_hand,
    reserved,
    safety_buffer,
    available_to_sell,
    version,
    pos_mode: 'shared',
    desired_pos_mode: 'shared',
    desired_pos_quota: available_to_sell,
    active_pos_quota: available_to_sell,
    pos_remaining: available_to_sell,
    pos_revision: version,
    pos_transition_state: 'stable',
    pos_sellable: available_to_sell,
    online_budget: available_to_sell,
  };
}

/** Reads effective POS state from the inventory snapshot; the browser never grants quota. */
export function usePOSAllocation(sku: string | undefined) {
  const [snapshot, setSnapshot] = useState<POSAllocationSnapshot | null>(null);
  const [loading, setLoading] = useState(Boolean(sku));
  const [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!sku) {
      setSnapshot(null);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setSnapshot(null);
    setLoading(true);
    setError(null);
    void getInventoryBySku(sku, controller.signal).then((row) => {
      setSnapshot(toPOSAllocationSnapshot(row));
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [sku, revision]);

  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  return { snapshot, loading, error, refresh };
}
