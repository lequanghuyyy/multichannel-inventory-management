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

function hasPOSAllocation(row: InventorySnapshot): row is InventorySnapshot & POSAllocationSnapshot {
  return Number.isSafeInteger(row.on_hand) && row.on_hand >= 0
    && Number.isSafeInteger(row.reserved) && row.reserved >= 0
    && Number.isSafeInteger(row.safety_buffer) && row.safety_buffer >= 0
    && Number.isSafeInteger(row.available_to_sell) && row.available_to_sell >= 0
    && Number.isSafeInteger(row.version) && row.version > 0
    && (row.pos_mode === 'shared' || row.pos_mode === 'dedicated')
    && (row.desired_pos_mode === 'shared' || row.desired_pos_mode === 'dedicated')
    && Number.isSafeInteger(row.desired_pos_quota) && (row.desired_pos_quota ?? -1) >= 0
    && Number.isSafeInteger(row.active_pos_quota) && (row.active_pos_quota ?? -1) >= 0
    && Number.isSafeInteger(row.pos_remaining) && (row.pos_remaining ?? -1) >= 0
    && Number.isSafeInteger(row.pos_revision) && (row.pos_revision ?? 0) > 0
    && (row.pos_transition_state === 'stable' || row.pos_transition_state === 'pending')
    && Number.isSafeInteger(row.pos_sellable) && (row.pos_sellable ?? -1) >= 0
    && Number.isSafeInteger(row.online_budget) && (row.online_budget ?? -1) >= 0;
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
      if (!hasPOSAllocation(row)) throw new Error('Máy chủ chưa trả về trạng thái POS quota hợp lệ.');
      setSnapshot(row);
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
