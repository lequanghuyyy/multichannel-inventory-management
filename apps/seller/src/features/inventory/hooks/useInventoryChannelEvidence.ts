import { useCallback, useEffect, useRef, useState } from 'react';
import { getProductChannelInventory, type ProductInventoryRow } from '../../../api/channel-operations';
import { getChannelSettings, type ChannelSettings } from '../../../api/channel-operations';
import { listChannels, type Channel } from '../../../api/channels';

export interface InventoryChannelEntry {
  channel: Channel;
  inventory?: ProductInventoryRow;
  settings?: ChannelSettings;
  inventoryError?: string;
  settingsError?: string;
}

export function useInventoryChannelEvidence(sku: string, productId: string, enabled: boolean) {
  const [entries, setEntries] = useState<InventoryChannelEntry[]>([]);
  const [loading, setLoading] = useState(enabled);
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
    if (!enabled) return;

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

      const settled: InventoryChannelEntry[] = [];
      for (let index = 0; index < channels.length; index += 4) {
        if (controller.signal.aborted) return;
        const batch = await Promise.all(channels.slice(index, index + 4).map(async (channel): Promise<InventoryChannelEntry> => {
          const [inventoryResult, settingsResult] = await Promise.allSettled([
            getProductChannelInventory(channel.id, productId, controller.signal),
            getChannelSettings(channel.id, controller.signal),
          ]);
          const entry: InventoryChannelEntry = { channel };
          if (inventoryResult.status === 'fulfilled') {
            entry.inventory = inventoryResult.value.find((row) => row.sku === sku);
            if (!entry.inventory) entry.inventoryError = 'API kênh chưa trả về SKU này.';
          } else if (!controller.signal.aborted) {
            entry.inventoryError = inventoryResult.reason instanceof Error ? inventoryResult.reason.message : 'Không tải được dữ liệu listing.';
          }
          if (settingsResult.status === 'fulfilled') entry.settings = settingsResult.value;
          else if (!controller.signal.aborted) entry.settingsError = settingsResult.reason instanceof Error ? settingsResult.reason.message : 'Không tải được quyền và trạng thái kênh.';
          return entry;
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
  }, [attempt, enabled, productId, sku]);

  const refresh = useCallback(() => setAttempt((value) => value + 1), []);
  const revalidate = refresh;

  useEffect(() => {
    if (!entries.some(({ inventory }) => ['queued', 'running'].includes(inventory?.latest_job_status ?? ''))) return;
    const timer = window.setInterval(revalidate, 3000);
    return () => window.clearInterval(timer);
  }, [entries, revalidate]);

  return { entries, error, loading, refresh, refreshing, revalidate };
}
