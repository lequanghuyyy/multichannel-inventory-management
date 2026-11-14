import { useCallback, useEffect, useState } from 'react';
import type { DemoMode } from '../../mocks/mock-api';

export function useMockData<T>(load: (mode: DemoMode) => Promise<T>, mode: DemoMode) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void load(mode).then(next => { if (active) setValue(next); }).catch(reason => {
      if (active) setError(reason);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load, mode]);
  useEffect(() => {
    const cleanup = refresh();
    return cleanup;
  }, [refresh]);
  return { value, error, loading, refresh };
}
