import { useEffect, useRef, useState } from 'react';
import { loadSnapshot, type Snapshot } from '../../core/api';

export interface SystemSnapshotState {
  snapshot: Snapshot | null;
  loading: boolean;
  error: string;
  checked: string;
  refresh: () => Promise<void>;
}

export function useSystemSnapshot(): SystemSnapshotState {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checked, setChecked] = useState('');
  const active = useRef<AbortController | null>(null);

  async function refresh() {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setError('');
    const timer = window.setTimeout(() => controller.abort(), 8000);

    try {
      const next = await loadSnapshot(controller.signal);
      if (active.current !== controller) return;
      setSnapshot(next);
      setChecked(new Date().toLocaleTimeString('vi-VN'));
    } catch {
      if (active.current !== controller) return;
      setSnapshot(null);
      setError('Chưa kết nối được backend. Kiểm tra Docker Compose, địa chỉ API và kết nối mạng rồi thử lại.');
    } finally {
      window.clearTimeout(timer);
      if (active.current === controller) setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    return () => {
      const pending = active.current;
      active.current = null;
      pending?.abort();
    };
  }, []);

  return { snapshot, loading, error, checked, refresh };
}
