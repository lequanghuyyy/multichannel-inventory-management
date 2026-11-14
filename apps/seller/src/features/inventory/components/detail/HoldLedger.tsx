import { useCallback, useState } from 'react';
import { cancelHold, confirmHold, expireHold, getReservation, releaseHold, type Hold } from '../../../../api/reservations';
import { StatusBadge } from '../../../../components/common/StatusBadge';
import { Button } from '../../../../components/ui/Button';

export interface HoldLedgerProps {
  holds: Hold[];
  loading: boolean;
  error: unknown;
  /** Re-reads the ledger and the balance after a move, rather than patching the row locally. */
  onChanged: () => void;
}

const stateLabel: Record<string, string> = {
  ACTIVE: 'Đang giữ',
  CONFIRMED: 'Đã bán',
  RELEASED: 'Đã giải phóng',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Hết hạn',
};

/**
 * The hold ledger for one SKU, with the four moves the API actually serves.
 *
 * Which buttons appear is derived from the hold's state and from `is_due`, both read from the
 * audit route. That is the point of the panel: `reserved` on the balance says stock is held but
 * not by whom or until when, and without this the only way to find out is `psql` while a
 * customer waits.
 *
 * `expire` is offered only when `is_due` is true. The API refuses it otherwise, and a button
 * that is always there and always fails teaches the operator the route is broken.
 */
export function HoldLedger({ holds, loading, error, onChanged }: HoldLedgerProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // Looked up by id, for an operator who has one from a log line rather than from this page.
  const [lookup, setLookup] = useState('');
  const [inspected, setInspected] = useState<Hold | null>(null);

  const inspect = useCallback(async () => {
    const id = lookup.trim();
    if (!id) return;
    setFailure(null);
    try {
      setInspected(await getReservation(id));
    } catch (cause) {
      // No fallback to a nearby row. This is the audit surface.
      setInspected(null);
      setFailure(cause instanceof Error ? cause.message : 'Không tra được lần giữ này.');
    }
  }, [lookup]);

  const move = useCallback(async (hold: Hold, kind: 'sell' | 'release' | 'cancel' | 'expire') => {
    setBusy(hold.id);
    setFailure(null);
    // The key names the hold AND the move. Pressing twice replays the first result instead of
    // releasing twice; a deliberate second move of a different kind gets its own key.
    const key = `${hold.id}:${kind}`;
    try {
      if (kind === 'sell') await confirmHold(hold.id, key);
      else if (kind === 'release') await releaseHold(hold.id, key);
      else if (kind === 'cancel') await cancelHold(hold.id, key);
      else await expireHold(hold.id, key);
      onChanged();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : 'Không thực hiện được.');
    } finally {
      setBusy(null);
    }
  }, [onChanged]);

  return (
    <section aria-label="Sổ giữ chỗ" className="grid gap-3 rounded-card border border-line bg-white p-5">
      <div>
        <h2 className="font-display text-lg font-bold text-on-surface">Sổ giữ chỗ</h2>
        <p className="mt-1 font-body text-body-sm text-graphite">
          Cho biết hàng đang được giữ cho đơn nào và giữ đến khi nào.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 font-body text-caption text-graphite" htmlFor="hold-lookup">
          Tra một lần giữ theo mã
          <input
            id="hold-lookup"
            className="min-h-10 rounded-control border border-line px-3 font-mono text-caption"
            value={lookup}
            placeholder="00000000-0000-4000-8000-000000000000"
            onChange={(event) => setLookup(event.target.value)}
          />
        </label>
        <Button size="sm" variant="secondary" disabled={busy !== null || lookup.trim() === ''} onClick={() => void inspect()}>Tra</Button>
      </div>
      {inspected ? (
        <p role="status" className="rounded-control bg-surface-container-low p-3 font-body text-caption text-on-surface">
          {inspected.id} · {inspected.sku} · SL {inspected.quantity} · {stateLabel[inspected.status] ?? inspected.status}
          {inspected.is_due ? ' · đã quá hạn' : ''} · hết hạn {inspected.expires_at.slice(0, 16).replace('T', ' ')}
        </p>
      ) : null}
      {loading ? <p className="font-body text-body-sm text-graphite">Đang tải sổ giữ chỗ…</p> : null}
      {error ? <p role="alert" className="font-body text-body-sm text-badge-blocked-text">{error instanceof Error ? error.message : String(error)}</p> : null}
      {!loading && !error && holds.length === 0 ? (
        <p className="font-body text-body-sm text-graphite">Không có lần giữ nào cho SKU này.</p>
      ) : null}
      {holds.length > 0 ? (
        <>
        {/* Cards on mobile, table on desktop — the same split every other list in this app
            uses. A wide table on a 390px screen either forces the document to scroll sideways
            or forces the operator to pinch-zoom a hold id they are trying to read. */}
        <div className="grid gap-3 md:hidden">
          {holds.map((hold) => (
            <article key={hold.id} className="grid gap-2 rounded-control bg-surface-container-low p-3">
              <div className="flex items-start justify-between gap-2">
                <strong className="font-mono text-caption text-on-surface">{hold.id.slice(0, 8)}</strong>
                <StatusBadge tone={hold.status === 'ACTIVE' ? 'warning' : 'neutral'}>{stateLabel[hold.status] ?? hold.status}</StatusBadge>
              </div>
              <p className="font-body text-caption text-graphite">SL {hold.quantity} · hết hạn {hold.expires_at.slice(11, 16)}</p>
              {hold.is_due ? <p className="font-body text-caption text-badge-blocked-text">đã quá hạn, đang chờ hệ thống giải phóng</p> : null}
              {hold.status === 'ACTIVE' ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void move(hold, 'sell')}>Bán ra</Button>
                  <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void move(hold, 'release')}>Giải phóng</Button>
                  <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void move(hold, 'cancel')}>Hủy giữ</Button>
                  {hold.is_due ? <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void move(hold, 'expire')}>Hết hạn ngay</Button> : null}
                </div>
              ) : null}
            </article>
          ))}
        </div>
        <div className="hidden md:block">
        <table className="w-full text-left font-body text-body-sm">
          <caption className="sr-only">Sổ giữ chỗ</caption>
          <thead>
            <tr className="text-caption uppercase tracking-[0.1em] text-graphite">
              <th className="py-2">Mã giữ</th><th className="py-2">SL</th><th className="py-2">Trạng thái</th>
              <th className="py-2">Hết hạn</th><th className="py-2">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {holds.map((hold) => (
              <tr key={hold.id} className="border-t border-line align-top">
                <td className="py-2 font-mono text-caption">{hold.id.slice(0, 8)}</td>
                <td className="py-2 tabular-nums">{hold.quantity}</td>
                <td className="py-2">
                  {stateLabel[hold.status] ?? hold.status}
                  {/* is_due describes the clock, not the sweeper. Saying so here is what
                      stops an operator from reading it as "the worker has been and gone". */}
                  {hold.status === 'ACTIVE' && hold.is_due ? <span className="block text-caption text-badge-blocked-text">đã quá hạn, đang chờ hệ thống giải phóng</span> : null}
                </td>
                <td className="py-2 text-caption text-graphite">{hold.expires_at.slice(0, 16).replace('T', ' ')}</td>
                <td className="py-2">
                  {hold.status === 'ACTIVE' ? (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void move(hold, 'sell')}>Bán ra</Button>
                      <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void move(hold, 'release')}>Giải phóng</Button>
                      <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void move(hold, 'cancel')}>Hủy giữ</Button>
                      {hold.is_due ? (
                        <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void move(hold, 'expire')}>Hết hạn ngay</Button>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-caption text-graphite">Không còn chuyển trạng thái nào</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        </>
      ) : null}
      {failure ? <p role="alert" className="font-body text-body-sm text-badge-blocked-text">{failure}</p> : null}
    </section>
  );
}