import { useCallback, useEffect, useRef, useState } from 'react';
import { getProductChannelInventory, type ProductInventoryRow } from '../../../api/channel-operations';
import { listChannels, type Channel } from '../../../api/channels';

export interface ProductChannelAllocationEntry {
  channel: Channel;
  rows: ProductInventoryRow[];
  error?: string;
}

/**
 * Reads the per-listing inventory evidence the allocation workspace needs. One request per
 * channel is what the API exposes; the result is kept whole so the panel can select the row
 * whose canonical SKU matches the chosen variant.
 */
export function useProductChannelAllocations(productId: string) {
  const [entries, setEntries] = useState<ProductChannelAllocationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  useEffect(() => {
    if (!productId) {
      setEntries([]);
      setLoading(false);
      setRefreshing(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const hasSnapshot = entriesRef.current.length > 0;
    setLoading(!hasSnapshot);
    setRefreshing(hasSnapshot);
    setError(null);

    void (async () => {
      let cursor: string | undefined;
      const channels: Channel[] = [];
      do {
        const page = await listChannels({ limit: 100, ...(cursor ? { cursor } : {}) }, controller.signal);
        channels.push(...page.items.filter((channel) => channel.type === 'marketplace' || channel.type === 'website'));
        cursor = page.nextCursor ?? undefined;
      } while (cursor && !controller.signal.aborted);

      const settled: ProductChannelAllocationEntry[] = [];
      for (let index = 0; index < channels.length; index += 4) {
        if (controller.signal.aborted) return;
        const batch = await Promise.all(channels.slice(index, index + 4).map(async (channel): Promise<ProductChannelAllocationEntry> => {
          try {
            return { channel, rows: await getProductChannelInventory(channel.id, productId, controller.signal) };
          } catch (cause) {
            return {
              channel,
              rows: [],
              error: cause instanceof Error ? cause.message : 'Không tải được dữ liệu listing của kênh.',
            };
          }
        }));
        settled.push(...batch);
      }

      if (controller.signal.aborted) return;
      setEntries(settled);
      setError(null);
    })().catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause);
    }).finally(() => {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    });

    return () => controller.abort();
  }, [attempt, productId]);

  useEffect(() => {
    if (!entries.some((entry) => entry.rows.some((row) =>
      ['queued', 'running'].includes(row.latest_job_status ?? '') || row.allocation_plan_status === 'applying',
    ))) return;
    const timer = window.setInterval(() => setAttempt((value) => value + 1), 3000);
    return () => window.clearInterval(timer);
  }, [entries]);

  const refresh = useCallback(() => setAttempt((value) => value + 1), []);

  return { entries, error, loading, refresh, refreshing };
}
