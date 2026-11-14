import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getLazadaPublication,
  getLazadaPublicationHistory,
  publishLazadaProduct,
  retryLazadaPublication,
  type LazadaPublication,
  type LazadaPublicationHistory,
  type LazadaPublicationSKU,
} from '../../../api/lazada';
import { ErrorState } from '../../../components/common/ScreenState';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { formatMinor } from '../../../lib/money';
import { newIdempotencyKey } from '../../products/product.write';
import { ProductChannelNotice } from '../../products/components/ProductChannelUi';
import {
  lazadaErrorText,
  lazadaEventText,
  lazadaPriceText,
  lazadaPublicationIsProcessing,
  lazadaPublicationStateLabel,
  lazadaPublicationTone,
  lazadaQCHint,
} from './lazada-publish.messages';

type TimelineState = 'done' | 'current' | 'pending' | 'error';

const stateOrder = ['queued', 'creating', 'create_submitted', 'mapping_verification_pending', 'qc_pending', 'qc_approved', 'live'];

function stateReached(state: string, target: string): boolean {
  const current = stateOrder.indexOf(state);
  const wanted = stateOrder.indexOf(target);
  return current >= 0 && wanted >= 0 && current >= wanted;
}

function timeline(publication: LazadaPublication): Array<{ label: string; detail: string; state: TimelineState }> {
  const accepted = publication.state !== 'not_exported' || Boolean(publication.latest_job);
  const itemKnown = Boolean(publication.remote_item_id);
  const created = itemKnown || stateReached(publication.state, 'create_submitted');
  const skuVerified = publication.expected_sku_count > 0 && publication.verified_sku_count >= publication.expected_sku_count && publication.mapping_state === 'mapped';
  const approved = ['qc_approved', 'live', 'inactive'].includes(publication.state) || ['approved', 'live'].includes(publication.qc_status ?? '');
  const rejected = publication.state === 'qc_rejected' || publication.qc_status === 'rejected';
  const live = publication.state === 'live' || publication.state === 'inactive';
  const failedCreate = ['failed', 'blocked', 'needs_reconciliation'].includes(publication.state) && !itemKnown;
  return [
    {
      label: 'Đã tiếp nhận yêu cầu',
      detail: accepted ? 'OctoFlow đã lưu yêu cầu bền vững và giao cho connector Lazada.' : 'Chưa có yêu cầu đăng Lazada.',
      state: accepted ? 'done' : 'pending',
    },
    {
      label: 'Đang tạo sản phẩm trên Lazada',
      detail: created ? 'Lazada đã nhận yêu cầu tạo sản phẩm.' : failedCreate ? 'Yêu cầu tạo sản phẩm chưa hoàn tất.' : publication.state === 'creating' ? 'Connector đang gửi sản phẩm sang Lazada.' : 'Chờ bắt đầu tạo sản phẩm.',
      state: created ? 'done' : failedCreate ? 'error' : publication.state === 'queued' || publication.state === 'creating' ? 'current' : 'pending',
    },
    {
      label: 'Đã nhận mã sản phẩm',
      detail: itemKnown ? `Lazada đã trả mã sản phẩm ${publication.remote_item_id}.` : 'Mã sản phẩm chỉ hiển thị sau khi Lazada xác nhận tạo thành công.',
      state: itemKnown ? 'done' : publication.state === 'creating' || publication.state === 'create_submitted' ? 'current' : 'pending',
    },
    {
      label: 'Đang xác minh SKU',
      detail: skuVerified ? `Đã xác minh ${publication.verified_sku_count}/${publication.expected_sku_count} SKU.` : publication.expected_sku_count ? `Đã xác minh ${publication.verified_sku_count}/${publication.expected_sku_count} SKU.` : 'Chưa có danh sách SKU cần xác minh.',
      state: skuVerified ? 'done' : publication.state === 'mapping_verification_pending' || created ? 'current' : 'pending',
    },
    {
      label: 'Chờ Lazada duyệt',
      detail: rejected ? 'Lazada đã từ chối một hoặc nhiều SKU.' : approved ? 'Lazada đã duyệt sản phẩm.' : publication.state === 'qc_pending' ? 'Sản phẩm đang trong hàng đợi kiểm duyệt của Lazada.' : 'Chưa tới bước kiểm duyệt.',
      state: rejected ? 'error' : approved ? 'done' : publication.state === 'qc_pending' ? 'current' : 'pending',
    },
    {
      label: 'Trạng thái bán hàng thực tế',
      detail: live ? (publication.state === 'live' ? 'Lazada xác nhận sản phẩm đang bán.' : 'Lazada xác nhận sản phẩm đã ngừng bán.') : 'Chỉ hiển thị “Đang bán” khi Lazada đã duyệt và đọc lại trạng thái thực tế.',
      state: live ? 'done' : approved ? 'current' : 'pending',
    },
  ];
}

function skuMappingLabel(sku: LazadaPublicationSKU): string {
  if (sku.mapping_verified) return 'Đã xác minh';
  if (sku.remote_sku_id) return 'Đã có SKU Lazada';
  if (sku.listed) return 'Đã có listing';
  return 'Chưa ghép';
}

function skuMappingTone(sku: LazadaPublicationSKU): 'success' | 'warning' | 'neutral' {
  if (sku.mapping_verified) return 'success';
  if (sku.remote_sku_id || sku.listed) return 'warning';
  return 'neutral';
}

function qcLabel(status?: string): { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } {
  switch ((status ?? '').toLocaleLowerCase('en')) {
    case 'approved':
    case 'live':
      return { label: 'Lazada đã duyệt', tone: 'success' };
    case 'rejected':
      return { label: 'Lazada từ chối', tone: 'danger' };
    case 'pending':
    case 'qc_pending':
      return { label: 'Chờ duyệt', tone: 'warning' };
    default:
      return { label: 'Chưa kiểm duyệt', tone: 'neutral' };
  }
}

export function LazadaPublicationPanel({
  channelId,
  productId,
  currency = 'VND',
  canWrite,
  refreshToken = 0,
  compact = false,
  onPublicationChange,
  onEditFields,
  onStartPublish,
}: {
  channelId: string;
  productId: string;
  currency?: string;
  canWrite: boolean;
  refreshToken?: number;
  compact?: boolean;
  onPublicationChange?: (publication: LazadaPublication) => void;
  onEditFields?: () => void;
  onStartPublish?: () => void;
}) {
  const [publication, setPublication] = useState<LazadaPublication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<'retry' | 'update' | null>(null);
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<LazadaPublicationHistory | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const publicationChangeRef = useRef(onPublicationChange);
  publicationChangeRef.current = onPublicationChange;

  const load = useCallback(async (signal?: AbortSignal, quiet = false) => {
    if (!quiet) setLoading(true);
    if (!quiet) setError(null);
    try {
      const result = await getLazadaPublication(channelId, productId, signal);
      if (signal?.aborted) return;
      setPublication(result);
      setActionError('');
      publicationChangeRef.current?.(result);
    } catch (cause) {
      if (!signal?.aborted && !quiet) setError(cause);
    } finally {
      if (!signal?.aborted && !quiet) setLoading(false);
    }
  }, [channelId, productId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [attempt, load, refreshToken]);

  useEffect(() => {
    if (!publication || !lazadaPublicationIsProcessing(publication.state)) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') void load(controller.signal, true);
    }, 3000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [load, publication?.state]);

  const steps = useMemo(() => publication ? timeline(publication) : [], [publication]);
  // An imported listing can exist without a publication row (or with a row whose
  // remote id is still empty). Never offer create for it: reconcile the mapping instead.
  const imported = Boolean(publication && !publication.remote_item_id && publication.skus.some((sku) => sku.remote_sku_id || sku.listed));

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      setHistory(await getLazadaPublicationHistory(channelId, productId));
    } catch {
      setHistoryError('Không tải được lịch sử đăng Lazada.');
    } finally {
      setHistoryLoading(false);
    }
  }, [channelId, productId]);

  const act = async (kind: 'retry' | 'update') => {
    if (!publication || !canWrite || busy) return;
    setBusy(kind);
    setActionError('');
    setMessage('');
    try {
      const key = newIdempotencyKey(`lazada-${kind === 'retry' ? 'retry' : 'update'}`);
      const result = kind === 'retry'
        ? await retryLazadaPublication(channelId, productId, key)
        // No expected versions: the backend uses the durable publication/Core versions
        // rather than a value that may have gone stale while this panel was open.
        : await publishLazadaProduct(channelId, productId, { operation: 'update' }, key);
      setPublication(result.publication);
      publicationChangeRef.current?.(result.publication);
      setHistory(null);
      if (historyOpen) void refreshHistory();
      setMessage(kind === 'retry'
        ? 'Đã tiếp nhận yêu cầu thử lại an toàn. Trạng thái sẽ tiếp tục được cập nhật.'
        : 'Đã tiếp nhận yêu cầu cập nhật listing Lazada hiện có.');
    } catch (cause) {
      const code = cause instanceof Error && 'code' in cause ? String((cause as { code: unknown }).code) : undefined;
      if (code === 'LAZADA_PRODUCT_NOT_READY') {
        setActionError('Còn thông tin Lazada bắt buộc chưa hoàn tất. Bổ sung trường được đánh dấu, kiểm tra lại rồi xác nhận gửi.');
        onEditFields?.();
      } else {
        setActionError(lazadaErrorText(code));
      }
    } finally {
      setBusy(null);
    }
  };

  const openHistory = () => {
    const nextOpen = !historyOpen;
    setHistoryOpen(nextOpen);
    if (nextOpen && !history) void refreshHistory();
  };

  if (loading && !publication) return <Card className="grid gap-3 p-5" aria-busy="true">
    <div className="h-5 w-48 animate-pulse rounded bg-surface-container-low" />
    <div className="h-3 w-72 max-w-full animate-pulse rounded bg-surface-container-low" />
    <div className="h-20 animate-pulse rounded-lg bg-surface-container-low" />
    <p className="text-xs text-graphite">Đang đọc trạng thái đăng Lazada…</p>
  </Card>;

  if (error && !publication) return <Card className="grid gap-3 p-5"><ErrorState error={error} retry={() => setAttempt((value) => value + 1)} /></Card>;

  if (!publication) return null;

  const qc = qcLabel(publication.qc_status);
  const canRetry = canWrite && publication.can_retry;
  const canUpdate = canWrite && publication.can_update && !publication.can_retry;
  const canCreate = canWrite && publication.can_create && !imported;

  return <div className="grid gap-4">
    <Card className="grid gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-octo-ember">TRẠNG THÁI LAZADA</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge tone={lazadaPublicationTone(publication.state)} live={lazadaPublicationIsProcessing(publication.state)}>{lazadaPublicationStateLabel(publication.state)}</StatusBadge>
            {publication.remote_item_id ? <span className="text-xs text-graphite">Mã sản phẩm Lazada: <strong className="font-mono text-on-surface">{publication.remote_item_id}</strong></span> : null}
          </div>
        </div>
        <Button variant="secondary" size="sm" loading={loading} onClick={() => setAttempt((value) => value + 1)}>Làm mới trạng thái</Button>
      </div>

      {imported ? <ProductChannelNotice kind="info">
        Sản phẩm này đã có listing Lazada từ trước hoặc được ghép từ catalog. OctoFlow không tạo sản phẩm mới để tránh trùng; hãy đối soát và ghép SKU với listing hiện có.
      </ProductChannelNotice> : null}

      {publication.state === 'not_exported' && !imported ? <ProductChannelNotice kind="info">
        Sản phẩm chưa được gửi lên Lazada. Hoàn tất thông tin ngành hàng, thương hiệu, ảnh và kiện hàng để bắt đầu.
      </ProductChannelNotice> : null}

      {publication.state === 'qc_rejected' ? <ProductChannelNotice kind="error">
        <strong className="block">Lazada từ chối sản phẩm</strong>
        <span className="mt-1 block">{publication.qc_reason || lazadaErrorText(publication.qc_reason_code)}</span>
        <span className="mt-1 block">{lazadaQCHint(publication.qc_reason, publication.qc_reason_code)}</span>
      </ProductChannelNotice> : null}

      {publication.state === 'qc_pending' && publication.latest_job?.last_error_code === 'ApiCallLimit' ? <ProductChannelNotice kind="info">
        {lazadaErrorText(publication.latest_job.last_error_code)}
      </ProductChannelNotice> : null}

      {['failed', 'blocked', 'needs_reconciliation', 'superseded'].includes(publication.state) ? <ProductChannelNotice kind="warning">
        <strong className="block">{publication.state === 'needs_reconciliation' ? 'Cần đối soát với Lazada' : 'Chưa thể hoàn tất đăng Lazada'}</strong>
        <span className="mt-1 block">{lazadaErrorText(publication.last_error_code || publication.qc_reason_code)}</span>
        {publication.state === 'needs_reconciliation' ? <span className="mt-1 block">Hệ thống sẽ đọc lại catalog Lazada trước khi gửi lại; không tự tạo sản phẩm trùng.</span> : null}
      </ProductChannelNotice> : null}

      {publication.state === 'live' ? <ProductChannelNotice kind="success">
        Lazada đã xác nhận sản phẩm đang bán. Đây là trạng thái cuối sau khi mapping SKU và QC được đọc lại.
      </ProductChannelNotice> : null}

      {!compact && publication.state !== 'not_exported' ? <div className="grid gap-2" aria-label="Tiến trình đăng Lazada">
        <p className="text-xs font-semibold text-graphite">Tiến trình</p>
        <ol className="grid gap-2">
          {steps.map((step, index) => <li key={step.label} className="grid grid-cols-[24px_minmax(0,1fr)] gap-2">
            <span aria-hidden="true" className={`mt-0.5 grid size-5 place-items-center rounded-full border text-[10px] font-bold ${step.state === 'done' ? 'border-badge-progress-text bg-badge-progress-bg text-badge-progress-text' : step.state === 'error' ? 'border-error bg-error-container text-error' : step.state === 'current' ? 'border-octo-ember text-octo-ember' : 'border-outline-variant text-graphite'}`}>{step.state === 'done' ? '✓' : step.state === 'error' ? '!' : index + 1}</span>
            <span className="min-w-0 border-b border-outline-variant/40 pb-2 last:border-b-0"><strong className={`block text-sm ${step.state === 'pending' ? 'text-graphite' : 'text-on-surface'}`}>{step.label}</strong><span className="mt-0.5 block text-xs leading-5 text-graphite">{step.detail}</span></span>
          </li>)}
        </ol>
      </div> : null}

      {!compact ? <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-on-surface">SKU và mapping Lazada</p>
          <span className="text-xs text-graphite">{publication.verified_sku_count}/{publication.expected_sku_count} SKU đã xác minh · Giá {publication.price_state === 'verified' ? 'đã xác minh' : 'đang chờ xác minh'}</span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-outline-variant/60">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-surface-container-low text-xs text-graphite"><tr><th className="p-3">SKU Core</th><th className="p-3">Seller SKU</th><th className="p-3">Giá Core</th><th className="p-3">Giá Lazada</th><th className="p-3">Mapping</th><th className="p-3">QC</th></tr></thead>
            <tbody className="divide-y divide-outline-variant/40">{publication.skus.map((sku) => {
              const skuQC = qcLabel(sku.remote_qc_status);
              return <tr key={sku.variant_id}>
                <td className="p-3"><strong className="font-mono text-xs text-on-surface">{sku.sku}</strong></td>
                <td className="p-3 font-mono text-xs">{sku.shop_sku || sku.seller_sku || '—'}</td>
                <td className="p-3 tabular-nums">{sku.core_price_minor === undefined ? '—' : formatMinor(sku.core_price_minor, currency)}</td>
                <td className="p-3 tabular-nums">{sku.remote_price ? lazadaPriceText(sku.remote_price, currency) : sku.lazada_price ? `${lazadaPriceText(sku.lazada_price, currency)} (đã đặt)` : '—'}</td>
                <td className="p-3"><StatusBadge tone={skuMappingTone(sku)}>{skuMappingLabel(sku)}</StatusBadge>{sku.price_verified ? <span className="mt-1 block text-[11px] text-badge-progress-text">Giá khớp</span> : null}</td>
                <td className="p-3"><StatusBadge tone={skuQC.tone}>{skuQC.label}</StatusBadge>{sku.remote_qc_reason ? <span className="mt-1 block max-w-[220px] text-[11px] leading-4 text-graphite">{sku.remote_qc_reason}</span> : null}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        {publication.qc_status ? <p className="text-xs text-graphite">Trạng thái duyệt tổng thể: <StatusBadge tone={qc.tone}>{qc.label}</StatusBadge></p> : null}
      </div> : null}

      {message ? <p role="status" className="text-sm text-badge-progress-text">{message}</p> : null}
      {actionError ? <p role="alert" className="text-sm text-error">{actionError}</p> : null}

      <div className="flex flex-col-reverse justify-between gap-2 border-t border-outline-variant/50 pt-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-2">
          {onEditFields && (publication.state === 'qc_rejected' || publication.state === 'needs_reconciliation' || publication.state === 'failed' || publication.state === 'blocked') ? <Button size="sm" variant="secondary" onClick={onEditFields}>Sửa thông tin Lazada</Button> : null}
          {canRetry ? <Button size="sm" loading={busy === 'retry'} disabled={Boolean(busy)} onClick={() => void act('retry')}>Thử lại an toàn</Button> : null}
          {canUpdate ? <Button size="sm" loading={busy === 'update'} disabled={Boolean(busy)} onClick={() => void act('update')}>Cập nhật từ Core</Button> : null}
          {canCreate && onStartPublish ? <Button size="sm" onClick={onStartPublish}>Thiết lập đăng Lazada</Button> : null}
        </div>
        <p className="text-xs leading-5 text-graphite">Chỉ trạng thái “Đang bán” mới là đăng thành công. Tạo listing không đồng bộ tồn kho Lazada.</p>
      </div>
    </Card>

    <div className="rounded-lg border border-outline-variant bg-pure-white p-3">
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" aria-expanded={historyOpen} aria-controls={`lazada-publication-history-${productId}`} onClick={() => void openHistory()}>{historyOpen ? 'Ẩn lịch sử' : 'Xem lịch sử'}</Button>
      </div>
      {historyOpen ? <div id={`lazada-publication-history-${productId}`} className="mt-3 grid gap-3">
        {historyLoading ? <p className="text-xs text-graphite">Đang tải lịch sử…</p> : null}
        {historyError ? <p role="alert" className="text-sm text-error">{historyError}</p> : null}
        {history?.jobs.length ? <div className="overflow-x-auto rounded-lg border border-outline-variant/50">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="bg-surface-container-low text-graphite"><tr><th className="p-2">Thời điểm</th><th className="p-2">Thao tác</th><th className="p-2">Trạng thái</th><th className="p-2">Mã sản phẩm</th><th className="p-2">Lỗi</th></tr></thead>
            <tbody className="divide-y divide-outline-variant/40">{history.jobs.map((job) => <tr key={job.id}>
              <td className="p-2 text-graphite">{formatTime(job.created_at)}</td>
              <td className="p-2">{job.operation === 'create' ? 'Tạo mới' : job.operation === 'update' ? 'Cập nhật' : 'Đối soát'}</td>
              <td className="p-2"><StatusBadge tone={lazadaPublicationTone(job.state)}>{lazadaPublicationStateLabel(job.state)}</StatusBadge></td>
              <td className="p-2 font-mono">{job.remote_item_id || '—'}</td>
              <td className="p-2 text-graphite">{job.last_error_code ? lazadaErrorText(job.last_error_code) : '—'}</td>
            </tr>)}</tbody>
          </table>
        </div> : !historyLoading && !historyError ? <p className="text-xs text-graphite">Chưa có lần gửi Lazada nào cho sản phẩm này.</p> : null}
        {history?.events.length ? <details className="rounded-lg border border-outline-variant/50 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-on-surface">Sự kiện xác minh gần đây · {history.events.length}</summary>
          <ol className="mt-2 grid gap-2">{history.events.slice(0, 20).map((event) => <li key={event.id} className="border-l-2 border-outline-variant pl-2"><p className="text-xs font-semibold text-on-surface">{lazadaEventText(event.event_code)}</p><p className="text-xs text-graphite">{formatTime(event.created_at)} · {lazadaPublicationStateLabel(event.state)}</p></li>)}</ol>
        </details> : null}
      </div> : null}
    </div>
  </div>;
}

function formatTime(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' });
}
