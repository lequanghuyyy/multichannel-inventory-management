import { useCallback, useEffect, useState } from 'react';
import {
  getWooCommerceStatus,
  getWooCommerceProductJobs,
  getWooCommerceProductState,
  queueWooCommerceProductAction,
  retryWooCommerceProductJob,
  type WooCommerceProductAction,
  type WooCommerceProductPublicationState,
  type WooCommerceProductSyncJob,
} from '../../../api/woocommerce';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { ChannelBrandIcon } from '../../../components/common/ChannelBrandIcon';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { newIdempotencyKey } from '../product.write';
import { getChannelPrices, type ChannelVariantPrice } from '../../../api/products';
import { productWriteErrorForCode, productWriteErrorMessage } from '../product.write.messages';
import type { ProductApiDetail } from '../product.detail.api';
import { ProductInventorySync } from './ProductInventorySync';
import { ProductChannelActionCard, ProductChannelNotice, ProductChannelProgressNotice, ProductChannelStatusGrid } from './ProductChannelUi';

type Operation = WooCommerceProductAction['operation'];
type UiOperation = 'create_draft' | 'sync' | 'publish' | 'unpublish';
type PendingAction = UiOperation | 'retry' | null;

const actionGroups: { title: string; description: string; actions: { value: UiOperation; label: string }[] }[] = [
  { title: 'Thông tin sản phẩm', description: 'Tạo hoặc cập nhật bản nháp, gồm cả giá bán.', actions: [
    { value: 'create_draft', label: 'Tạo bản nháp' }, { value: 'sync', label: 'Cập nhật thông tin và giá' },
  ] },
  { title: 'Bán hàng', description: 'Mở hoặc ngừng bán sản phẩm trên WooCommerce.', actions: [
    { value: 'publish', label: 'Đăng bán' }, { value: 'unpublish', label: 'Ngừng bán' },
  ] },
];
const actionLabels: Record<UiOperation, string> = {
  create_draft: 'Tạo bản nháp', sync: 'Cập nhật thông tin và giá', publish: 'Đăng bán', unpublish: 'Ngừng bán',
};

const publicationLabels: Record<string, string> = {
  not_exported: 'Chưa gửi', draft: 'Bản nháp', published: 'Đang bán', private: 'Riêng tư', pending: 'Chờ duyệt trên WooCommerce', sync_pending: 'Đang đồng bộ',
  sync_failed: 'Đồng bộ lỗi', conflict: 'Xung đột', blocked: 'Bị chặn',
};
const mappingLabels: Record<string, string> = {
  unmapped: 'Chưa ghép ID', mapped: 'Đã ghép ID', verification_pending: 'Chờ xác minh', conflict: 'Xung đột ID',
};
const syncLabels: Record<string, string> = {
  not_synced: 'Chưa gửi', sync_pending: 'Đang chờ', syncing: 'Đang đồng bộ', verified: 'Đã xác minh',
  sync_failed: 'Thất bại', conflict: 'Xung đột', blocked: 'Bị chặn',
};
const jobLabels: Record<string, string> = {
  pending: 'Đang chờ đồng bộ', processing: 'Đang gửi và xác minh', retrying: 'Đang thử lại', succeeded: 'Đã xác minh',
  failed: 'Chưa hoàn tất', conflict: 'Cần xử lý', blocked: 'Bị chặn', superseded: 'Đã thay bằng phiên bản mới',
};

function stateTone(value: string): 'neutral' | 'success' | 'warning' | 'danger' {
  if (['published', 'draft', 'mapped', 'verified', 'active', 'succeeded'].includes(value)) return 'success';
  if (['sync_pending', 'syncing', 'activation_pending', 'verification_pending', 'pending', 'processing', 'retrying'].includes(value)) return 'warning';
  if (['sync_failed', 'conflict', 'blocked', 'activation_failed', 'failed'].includes(value)) return 'danger';
  return 'neutral';
}

export function WooCommerceProductPanel({ product, canWrite, wizardMode = false, priceRefreshKey, onDraftReadinessChange, onDraftSubmitReady, onDraftQueued }: {
  product: ProductApiDetail;
  canWrite: boolean;
  wizardMode?: boolean;
  priceRefreshKey?: number;
  onDraftReadinessChange?: (ready: boolean, reason?: string) => void;
  onDraftSubmitReady?: (submit: (() => Promise<void>) | null) => void;
  onDraftQueued?: (job: WooCommerceProductSyncJob) => void;
}) {
  const [state, setState] = useState<WooCommerceProductPublicationState | null>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [storeLabel, setStoreLabel] = useState('WooCommerce');
  const [jobs, setJobs] = useState<WooCommerceProductSyncJob[]>([]);
  const [prices, setPrices] = useState<ChannelVariantPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedOperation, setSelectedOperation] = useState<UiOperation | null>(null);
  const [checked, setChecked] = useState<{ operation: UiOperation; issues: string[] } | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal, silent = false) => {
    if (!silent) { setLoading(true); setError(null); }
    try {
      const [nextState, nextJobs, nextPrices] = await Promise.all([
        getWooCommerceProductState(product.id, signal),
        getWooCommerceProductJobs(product.id, signal),
        getChannelPrices(product.id, signal).then((result) => result.prices),
      ]);
      if (!signal?.aborted) { setState(nextState); setJobs(nextJobs); setPrices(nextPrices); setError(null); }
    } catch (cause) {
      if (!signal?.aborted) setError(productWriteErrorMessage(cause, 'Không tải được trạng thái WooCommerce.'));
    } finally {
      if (!signal?.aborted && !silent) setLoading(false);
    }
  }, [product.id]);

  useEffect(() => {
    const controller = new AbortController();
    setState(null); setJobs([]); setNotice(null); setPending(null); setHistoryOpen(false); setChecked(null); setSelectedOperation(null);
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh, product.productVersion, priceRefreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const status = await getWooCommerceStatus(controller.signal);
        if (!controller.signal.aborted) {
          setChannelId(status.channel_id ?? null);
          setStoreLabel(status.store_name?.trim() || status.store_origin || status.site_url || 'WooCommerce');
        }
      } catch {
        if (!controller.signal.aborted) setChannelId(null);
      }
    })();
    return () => controller.abort();
  }, []);

  const latest = jobs[0];
  const inProgress = Boolean(latest && ['pending', 'processing', 'retrying'].includes(latest.state));
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setInterval(() => { void refresh(controller.signal, true); }, inProgress ? 3000 : 15000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [inProgress, latest?.id, refresh]);

  const wooPrices = new Map(prices.filter((row) => row.channel_code === 'woocommerce').map((row) => [row.variant_id, row]));
  const skuReady = product.variants.length > 0 && product.variants.length <= 100 &&
    product.variants.every((variant) => variant.isActive && variant.sku.trim()) &&
    new Set(product.variants.map((variant) => variant.sku.trim())).size === product.variants.length;
  const priceReady = product.variants.every((variant) => {
      const channelPrice = wooPrices.get(variant.id);
      const amount = channelPrice?.override_amount == null ? variant.priceMinor : Number(channelPrice.override_amount);
      return amount !== null && Number.isSafeInteger(amount) && amount > 0 &&
        (channelPrice?.override_amount == null || channelPrice.currency === product.currency);
    });
  const ready = product.currency === 'VND' && product.status !== 'archived' && skuReady && priceReady;
  const writable = canWrite && Boolean(state?.channel_connected && state.product_write_enabled) && ready && !loading && !busy && !inProgress;
  const mapped = Boolean(state?.remote_product_id && state.mapping_state === 'mapped');
  const hasExistingListing = Boolean(state?.remote_product_id || state?.allocation_states?.length);
  const currentOperation = selectedOperation ?? (mapped ? state?.catalog_sync_state !== 'verified' || state?.publication_state === 'published' ? 'sync' : 'publish' : 'create_draft');
  const issuesFor = (operation: UiOperation): string[] => {
    const issues: string[] = [];
    if (!canWrite) issues.push('Bạn không có quyền quản lý sản phẩm trên kênh này.');
    if (product.currency !== 'VND') issues.push('Tiền tệ sản phẩm phải là VND để khớp với cửa hàng WooCommerce.');
    if (product.status === 'archived') issues.push('Sản phẩm đã lưu trữ trong Core; hãy mở lại trước khi gửi.');
    if (!skuReady) issues.push('Cần 1–100 mẫu mã đang hoạt động, mỗi mẫu mã có SKU không trùng.');
    if (!priceReady) issues.push('Mỗi SKU cần giá Core hoặc giá riêng WooCommerce lớn hơn 0, đúng tiền VND.');
    if (error) issues.push('Không đọc được trạng thái WooCommerce. Hệ thống sẽ tự thử tải lại.');
    if (loading || !state) issues.push('Đang kiểm tra kết nối WooCommerce.');
    else if (!state.channel_connected) issues.push('WooCommerce chưa được kết nối hoặc xác minh.');
    else if (!state.product_write_enabled) issues.push('Tài khoản hiện chưa cho phép OctoFlow tạo sản phẩm trên WooCommerce.');
    if (inProgress) issues.push('Một yêu cầu đang xử lý. Chờ WooCommerce xác minh kết quả trước khi gửi tiếp.');
    if (operation === 'create_draft' && (hasExistingListing || state?.publication_state === 'published')) issues.push('Sản phẩm đã có trên WooCommerce. Hãy đối soát liên kết trước để tránh tạo trùng hoặc ngừng bán ngoài ý muốn.');
    if (operation === 'sync' && !mapped) issues.push('Hãy tạo và xác minh bản nháp trước khi cập nhật thông tin và giá.');
    if (operation === 'publish') {
      if (!mapped || state?.catalog_sync_state !== 'verified') issues.push('Hãy xác minh bản nháp, mã sản phẩm và thông tin giá trước khi đăng bán.');
      if (product.status !== 'active') issues.push('Sản phẩm Core cần ở trạng thái đang hoạt động trước khi đăng bán.');
      if (!state?.inventory_write_enabled) issues.push('Kết nối WooCommerce cần quyền cập nhật tồn kho trước khi đăng bán.');
      if (!['draft', 'private', 'pending'].includes(state?.publication_state ?? '')) issues.push('Sản phẩm chưa ở trạng thái có thể đăng bán.');
    }
    if (operation === 'unpublish' && (!mapped || state?.publication_state !== 'published')) issues.push('Chỉ sản phẩm đang bán và đã liên kết mới có thể ngừng bán.');
    return [...new Set(issues)];
  };
  const checkedIssues = checked ? [...new Set([...checked.issues, ...issuesFor(checked.operation)])] : [];
  const checkedReady = checked?.operation === (wizardMode ? 'create_draft' : currentOperation) && checkedIssues.length === 0;

  const draftBlocker = !canWrite ? 'Bạn không có quyền quản lý sản phẩm trên kênh này.'
    : !ready ? 'Kiểm tra SKU, giá, tiền tệ và trạng thái sản phẩm trước khi tạo bản nháp.'
      : loading ? 'Đang kiểm tra kết nối WooCommerce.'
        : error ? 'Không đọc được trạng thái WooCommerce. Hãy tải lại rồi kiểm tra lại.'
          : !state?.channel_connected ? 'WooCommerce chưa được kết nối hoặc xác minh.'
            : !state.product_write_enabled ? 'Tài khoản hiện chưa cho phép OctoFlow tạo sản phẩm trên WooCommerce.'
              : hasExistingListing || state.publication_state === 'published' ? 'Sản phẩm đã có trên website. Hãy đối soát liên kết hiện tại để tránh tạo trùng.'
                : '';

  useEffect(() => {
    if (wizardMode) {
      onDraftReadinessChange?.(Boolean(checkedReady && writable && !hasExistingListing), draftBlocker || undefined);
      onDraftSubmitReady?.(checkedReady && writable && !hasExistingListing ? () => execute('create_draft') : null);
    }
  }, [checkedReady, draftBlocker, hasExistingListing, onDraftReadinessChange, onDraftSubmitReady, wizardMode, writable]);

  const execute = async (action: PendingAction) => {
    if (!action || !state || busy) return;
    if (action !== 'retry' && issuesFor(action).length) { setError(issuesFor(action).join(' ')); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      if (action === 'retry') {
        if (!latest) return;
        const queued = await retryWooCommerceProductJob(latest.id, newIdempotencyKey('woo-product-retry'));
        setNotice(`Đã xếp lại tác vụ ${queued.id} (${queued.operation}).`);
      } else {
        const operation: Operation = action === 'create_draft' || action === 'unpublish' ? 'draft' : action;
        const queued = await queueWooCommerceProductAction(product.id, {
          operation,
          expected_product_version: product.productVersion,
          ...(operation !== 'sync' ? { confirm: true } : {}),
        }, newIdempotencyKey(`woo-product-${operation}`));
        setNotice(action === 'publish' ? 'Đã tiếp nhận yêu cầu đăng bán. OctoFlow đang bật và xác minh quản lý tồn kho; trạng thái tự cập nhật.' :
          action === 'create_draft' ? 'Đã gửi yêu cầu tạo bản nháp. Trạng thái tự cập nhật; không cần gửi lại.' :
            `Đã gửi yêu cầu ${actionLabels[action].toLocaleLowerCase('vi')} trên WooCommerce. Trạng thái tự cập nhật; không cần gửi lại.`);
        if (wizardMode && action === 'create_draft') onDraftQueued?.(queued);
      }
      setPending(null); setChecked(null);
      await refresh();
    } catch (cause) {
      setError(productWriteErrorMessage(cause, 'Không thể xếp tác vụ WooCommerce.'));
      setPending(null);
      if (wizardMode && action === 'create_draft') throw cause;
    } finally {
      setBusy(false);
    }
  };
  const submit = () => void execute(pending);
  const runCheck = () => {
    const operation = wizardMode ? 'create_draft' : currentOperation;
    setError(null);
    setChecked({ operation, issues: issuesFor(operation) });
  };

  const retryable = Boolean(latest && latest.state === 'failed' && latest.safe_error_code !== 'MAPPING_CONFLICT');
  const inventoryActivation = state?.inventory_activation_state ?? 'inactive';
  const inventoryJob = jobs.find((job) => ['publish', 'inventory_activate'].includes(job.operation));
  const inventoryState = state?.publication_state === 'published' && inventoryActivation !== 'active' ? 'conflict' : state?.inventory_sync_state ?? 'not_synced';
  const showInventorySync = !wizardMode && Boolean(channelId);

  const activeErrorCode = state?.last_error_code ?? latest?.safe_error_code;

  return <Card className="grid gap-4 p-5" aria-label="Thông tin sản phẩm WooCommerce">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/50 pb-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-channel-paper text-carbon"><ChannelBrandIcon code="woocommerce" /></span>
        <div className="min-w-0">
          <h2 className="truncate font-body text-base font-semibold text-on-surface">{storeLabel}</h2>
          <p className="mt-1 font-body text-caption text-graphite">{state?.channel_connected ? 'Đã kết nối' : loading ? 'Đang kiểm tra kết nối' : 'Chưa kết nối'}</p>
        </div>
      </div>
      <StatusBadge tone={state ? stateTone(state.publication_state) : 'neutral'}>{state ? publicationLabels[state.publication_state] ?? 'Đang cập nhật' : 'Đang tải trạng thái'}</StatusBadge>
    </header>

    {error ? <ProductChannelNotice kind="error">{error}</ProductChannelNotice> : null}
    {notice ? <ProductChannelNotice kind="success">{notice}</ProductChannelNotice> : null}
    {activeErrorCode ? <ProductChannelNotice kind="error"><div className="flex flex-wrap items-center justify-between gap-3 text-caption"><div className="grid gap-1"><strong>Lần gửi gần nhất chưa hoàn tất.</strong><span>{wooJobError(activeErrorCode, priceReady)}</span>{state?.mapping_state === 'conflict' ? <span>Các SKU của sản phẩm: {product.variants.map((variant) => variant.sku).join(', ')}</span> : null}<code className="break-all font-mono">Mã lỗi: {activeErrorCode}</code></div>{!wizardMode ? <Button size="sm" variant="secondary" onClick={() => setHistoryOpen(true)}>Xem lần xử lý</Button> : null}</div></ProductChannelNotice> : null}

    {state ? <>
      <ProductChannelStatusGrid items={[
        { label: 'Ghép mã sản phẩm', value: mappingLabels[state.mapping_state] ?? 'Đang cập nhật', tone: stateTone(state.mapping_state) },
        { label: 'Thông tin và giá', value: syncLabels[state.catalog_sync_state] ?? 'Đang cập nhật', tone: stateTone(state.catalog_sync_state) },
        { label: 'Tồn kho trên kênh', value: syncLabels[inventoryState] ?? 'Đang cập nhật', tone: stateTone(inventoryState) },
      ]} />

      <section className="grid gap-3 rounded-lg bg-channel-paper p-4" aria-label="Thao tác WooCommerce">
        {wizardMode ? <p className="text-sm font-semibold text-on-surface">Tạo bản nháp</p> : <div className="grid gap-3 lg:grid-cols-2" aria-label="Nhóm thao tác cho WooCommerce">
          {actionGroups.map((group) => <ProductChannelActionCard key={group.title} title={group.title} description={group.description}>
            <div className="grid gap-2" role="group" aria-label={group.title}>
              {group.actions.map((action) => <button key={action.value} type="button" aria-pressed={currentOperation === action.value} disabled={busy || inProgress} onClick={() => { setSelectedOperation(action.value); setChecked(null); setError(null); }} className={`min-h-10 rounded-control border px-3 py-2 text-left text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-octo-ember disabled:cursor-not-allowed disabled:opacity-50 ${currentOperation === action.value ? 'border-carbon bg-carbon text-pure-white' : 'border-outline-variant bg-warm-alabaster text-on-surface hover:border-carbon'}`}>{action.label}</button>)}
            </div>
          </ProductChannelActionCard>)}
        </div>}
        <div className="grid gap-3 md:grid-cols-[minmax(12rem,1fr)_auto] md:items-end">
          <p className="self-center text-xs leading-5 text-graphite">{wizardMode ? 'Kiểm tra bản nháp trước khi gửi.' : currentOperation === 'publish' ? 'OctoFlow tự chuẩn bị theo dõi tồn kho khi đăng bán.' : currentOperation === 'sync' ? 'Cập nhật mô tả, mẫu mã và giá từ Core.' : 'Kiểm tra điều kiện trước khi gửi.'}</p>
          <Button size="sm" variant="secondary" disabled={loading || busy || inProgress} onClick={runCheck}>Kiểm tra điều kiện</Button>
        </div>
        {checked?.operation === (wizardMode ? 'create_draft' : currentOperation) ? <div role="region" className="grid gap-3 rounded-lg border border-sandstone bg-pure-white p-4" aria-label="Kết quả kiểm tra WooCommerce">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-body text-caption text-graphite">{actionLabels[checked.operation]}</p><h4 className="mt-1 font-body text-base font-semibold text-on-surface">{checkedReady ? checked.operation === 'create_draft' ? 'Đủ điều kiện tạo bản nháp' : 'Có thể tiếp tục' : 'Cần xử lý trước khi tiếp tục'}</h4></div><StatusBadge tone={checkedReady ? 'success' : 'danger'}>{checkedReady ? 'Có thể gửi' : 'Cần kiểm tra'}</StatusBadge></div>
          {checkedIssues.map((issue) => <p key={issue} className="text-body-sm leading-5 text-error">{issue}</p>)}
          {checkedReady && checked.operation === 'create_draft' ? <p className="text-caption leading-5 text-graphite">Dữ liệu hiện tại đủ điều kiện để gửi. Kết quả kiểm tra này chưa xóa lỗi lần gửi trước; sau khi xác nhận, OctoFlow sẽ tạo bản nháp và đọc lại trạng thái WooCommerce.</p> : null}
          {checkedReady && !wizardMode ? <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/50 pt-3"><p className="text-caption text-graphite">Xác nhận để gửi thao tác lên kênh.</p><Button size="sm" disabled={!canWrite || busy || inProgress} onClick={() => setPending(currentOperation)}>Xác nhận {actionLabels[currentOperation].toLocaleLowerCase('vi')}</Button></div> : null}
        </div> : null}
      </section>

      {state.publication_state === 'published' && inventoryActivation !== 'active' ? <p role="alert" className="rounded-control border border-badge-blocked-text/25 bg-badge-blocked-bg px-3 py-2 text-xs leading-5 text-badge-blocked-text">Sản phẩm đã đăng nhưng WooCommerce chưa xác minh theo dõi tồn. Kiểm tra quyền cập nhật tồn và thử lại tác vụ tồn kho trước khi coi luồng đăng là hoàn tất.</p> : null}
      {state.publication_state === 'published' ? <p role="status" className="text-xs leading-5 text-graphite">Số lượng trên cửa hàng có thể khác hạn mức phân bổ chung của Core. Phần bên dưới chỉ rõ hạn mức, số WooCommerce đọc lại, chênh lệch và cách đồng bộ lại nếu cần.</p> : null}
      {showInventorySync && channelId ? <ProductInventorySync key={`${product.id}:${state.publication_state}:${state.inventory_activation_state}:${inventoryJob?.state ?? ''}`} channelId={channelId} productId={product.id} channelName="WooCommerce" requireListedForActions canWrite={canWrite && state.inventory_write_enabled && !loading && !busy && !inProgress} /> : null}
    </> : loading ? <p role="status" className="text-sm text-graphite">Đang tải trạng thái WooCommerce…</p> : null}

    {inProgress && latest ? <ProductChannelProgressNotice channelName="WooCommerce" title={wooStateLabel(latest.state)} detail={latest.operation === 'publish' ? 'Đang mở bán và xác minh quản lý tồn kho.' : `${wooOperationLabel(latest.operation)} đang được đồng bộ.`} /> : null}

    {!wizardMode ? <footer className="flex justify-end border-t border-outline-variant/50 pt-3">
      <Button size="sm" variant="ghost" aria-expanded={historyOpen} aria-controls={`woo-product-history-${product.id}`} disabled={busy} onClick={() => setHistoryOpen((open) => !open)}>{historyOpen ? 'Ẩn lịch sử' : 'Xem lịch sử'}</Button>
    </footer> : null}
    {!wizardMode && historyOpen ? <section id={`woo-product-history-${product.id}`} className="grid gap-3" aria-label="Lịch sử đăng WooCommerce">
      <h3 className="font-body text-sm font-semibold text-on-surface">Lịch sử thao tác</h3>
      {jobs.length === 0 ? <p className="rounded-lg bg-surface-container-low p-3 text-body-sm text-graphite">Chưa có thao tác nào.</p> : null}
      {jobs.map((job) => <article key={job.id} className="grid gap-2 rounded-lg border border-outline-variant/50 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><strong className="font-body text-body-sm text-on-surface">{wooOperationLabel(job.operation)}</strong><StatusBadge tone={stateTone(job.state)}>{wooStateLabel(job.state)}</StatusBadge></div>
          <p className="mt-1 text-caption text-graphite">{formatDate(job.created_at)} · {job.attempt_count} lần thử</p>
          {job.safe_error_code ? <p className="mt-1 text-caption leading-5 text-error">{wooJobError(job.safe_error_code, priceReady)} <code className="break-all font-mono">Mã lỗi: {job.safe_error_code}</code></p> : null}
        </div>
        {job.id === latest?.id && retryable && canWrite ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => setPending('retry')}>Thử lại</Button> : null}
      </article>)}
    </section> : null}

    <Modal open={pending !== null} onClose={() => { if (!busy) setPending(null); }} title={pending === 'retry' ? 'Thử lại yêu cầu?' : pending === 'create_draft' ? 'Tạo bản nháp?' : pending === 'publish' ? 'Đăng bán sản phẩm?' : pending === 'unpublish' ? 'Ngừng bán sản phẩm?' : 'Cập nhật thông tin và giá?'} description="OctoFlow sẽ kiểm tra kết quả trực tiếp trên WooCommerce và cập nhật trạng thái tại đây." footer={<><Button variant="ghost" disabled={busy} onClick={() => setPending(null)}>Hủy</Button><Button loading={busy} variant={pending === 'unpublish' ? 'danger' : 'primary'} onClick={() => void submit()}>Xác nhận</Button></>}>
      <p className="text-sm leading-6 text-graphite">{pending === 'create_draft' ? 'Sản phẩm sẽ được tạo trên WooCommerce ở trạng thái bản nháp. Khách hàng chưa thể mua sản phẩm này.' : pending === 'publish' ? 'OctoFlow sẽ tự chuẩn bị theo dõi tồn kho, xác minh WooCommerce rồi mở bán. Sau đó hệ thống đồng bộ hạn mức tồn từ Core.' : pending === 'unpublish' ? 'Sản phẩm sẽ ngừng bán trên WooCommerce và chuyển về bản nháp.' : pending === 'sync' ? 'OctoFlow sẽ gửi lại thông tin và giá từ Core. Trạng thái bán hiện tại được giữ nguyên.' : 'Tác vụ lỗi sẽ được gửi lại và xác minh kết quả.'}</p>
    </Modal>
  </Card>;
}

function wooOperationLabel(operation: string) {
  return ({ sync: 'Đồng bộ thông tin sản phẩm', publish: 'Đăng bán', draft: 'Chuyển về bản nháp', inventory_activate: 'Bật quản lý tồn kho' } as Record<string, string>)[operation] ?? 'Cập nhật sản phẩm';
}

function wooStateLabel(state: string) { return jobLabels[state] ?? 'Đang cập nhật'; }

export function wooJobError(code: string, priceReady = false): string {
  if (code === 'CORE_PRICE_MISSING') return priceReady
    ? 'Lần thử trước chưa dùng được giá riêng đã lưu. Hãy tạo lại bản nháp để máy chủ kiểm tra và đồng bộ giá.'
    : 'SKU chưa có giá Core hoặc giá riêng WooCommerce. Sau khi lưu giá, hãy tạo lại bản nháp.';
  if (code === 'CORE_PRICE_INVALID') return 'Giá hiệu lực của SKU phải là số nguyên dương. Kiểm tra giá Core hoặc giá riêng WooCommerce.';
  if (code === 'CURRENCY_MISMATCH') return 'Giá riêng WooCommerce cần dùng cùng tiền VND với sản phẩm và cửa hàng.';
  if (code === 'PRODUCT_READBACK_MISMATCH') return 'Thông tin đọc lại từ WooCommerce chưa khớp. Hãy kiểm tra lại bản nháp để xác minh liên kết.';
  if (code === 'PUBLISHED_PRODUCT_REQUIRES_REVIEW') return 'WooCommerce đã có sản phẩm đang bán cùng mã định danh nhưng OctoFlow chưa xác minh được liên kết listing. Kiểm tra sản phẩm trên cửa hàng và ghép SKU trước khi tạo bản nháp; hệ thống không tự ngừng bán.';
  if (code === 'PRODUCT_OWNERSHIP_CONFLICT') return 'Sản phẩm cùng mã định danh trên WooCommerce không thuộc liên kết OctoFlow hiện tại. Kiểm tra ID sản phẩm và SKU trước khi gửi lại.';
  if (code === 'PRODUCT_MAPPING_TARGET_MISSING') return 'Sản phẩm WooCommerce đã liên kết trước đó không còn ở ID đã lưu. Kiểm tra sản phẩm trên cửa hàng trước khi gửi lại để tránh tạo trùng.';
  if (code === 'PUBLISHED_LISTING_MAPPING_INCOMPLETE') return 'Sản phẩm đang bán nhưng một số SKU chưa có listing đã xác minh. Đối soát từng SKU trước khi ngừng bán hoặc đồng bộ.';
  if (code === 'MAPPING_CONFLICT') return 'Mã SKU hoặc ID mẫu mã đọc lại từ WooCommerce không khớp với liên kết OctoFlow. Đối soát từng SKU trong lịch sử và trang ghép mã.';
  if (code === 'CORE_SKU_CONFLICT') return 'Có SKU Core trùng hoặc không còn duy nhất. Sửa mã mẫu mã trước khi gửi lại.';
  if (code === 'PRODUCT_TYPE_CONFLICT') return 'Loại sản phẩm WooCommerce hiện tại không khớp số mẫu mã Core. Kiểm tra sản phẩm đã liên kết trước khi đồng bộ.';
  if (code === 'VARIATION_OWNERSHIP_CONFLICT' || code === 'VARIATION_PARENT_CONFLICT') return 'Một mẫu mã trên WooCommerce đã thuộc sản phẩm hoặc liên kết khác. Đối soát ID mẫu mã và SKU trước khi gửi lại.';
  if (code === 'PRODUCT_STATUS_CONFLICT') return 'Trạng thái sản phẩm WooCommerce không thuộc các trạng thái OctoFlow hỗ trợ. Kiểm tra trực tiếp trên cửa hàng.';
  if (code === 'PUBLISHED_LISTING_REQUIRES_REVIEW') return 'Sản phẩm đang bán nhưng liên kết tồn kho chưa đủ an toàn để đồng bộ. Kiểm tra listing và số lượng từng SKU.';
  if (code === 'EXISTING_STOCK_REQUIRES_REVIEW') return 'WooCommerce đang có tồn khác 0. Kiểm tra tồn và đơn đang mở trước khi đăng bán.';
  if (code === 'UPSTREAM_HTTP_ERROR') return 'WooCommerce chưa hoàn tất yêu cầu. Kiểm tra kết nối cửa hàng rồi thử đồng bộ lại.';
  if (code === 'INVENTORY_READBACK_MISMATCH' || code === 'INVENTORY_TRACKING_DRIFT') return 'WooCommerce chưa xác nhận quản lý tồn kho. Hãy kiểm tra trạng thái bán và số lượng trên cửa hàng trước khi thử lại.';
  return productWriteErrorForCode(code) ?? 'Thao tác chưa được xác minh. Hãy kiểm tra trạng thái kết nối và sản phẩm trên cửa hàng.';
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' });
}
