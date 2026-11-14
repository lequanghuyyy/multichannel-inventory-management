import { useEffect, useRef, useState } from 'react';
import { getInventoryBySku, type InventorySnapshot } from '../../../api/inventory';

export type InventoryLookupState = 'idle' | 'loading' | 'success' | 'error';

export function useInventoryLookup(initialSku: string) {
  const [sku, setSku] = useState(initialSku);
  const [submittedSku, setSubmittedSku] = useState('');
  const [state, setState] = useState<InventoryLookupState>('idle');
  const [snapshot, setSnapshot] = useState<InventorySnapshot | null>(null);
  const [error, setError] = useState<unknown>(null);
  const active = useRef<AbortController | null>(null);

  useEffect(() => () => active.current?.abort(), []);

  async function lookup(value = sku) {
    const canonicalSku = value.trim();
    if (!canonicalSku) {
      setSubmittedSku('');
      setSnapshot(null);
      setError(null);
      setState('idle');
      return;
    }

    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setSku(canonicalSku);
    setSubmittedSku(canonicalSku);
    setState('loading');
    setError(null);
    setSnapshot(null);
    try {
      const result = await getInventoryBySku(canonicalSku, controller.signal);
      if (active.current !== controller) return;
      setSnapshot(result);
      setState('success');
    } catch (nextError) {
      if (active.current !== controller) return;
      setError(nextError);
      setState('error');
    }
  }

  return { error, lookup, setSku, sku, snapshot, state, submittedSku };
}
