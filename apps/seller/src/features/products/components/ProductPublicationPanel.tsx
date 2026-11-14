import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiRequestError, presentApiError } from '../../../core/api-error';
import {
  createProductPublication,
  getProductPublicationHistory,
  listProductPublications,
  previewProductPublication,
  retryProductPublication,
  type ProductChannelPublication,
  type ProductPublicationCollection,
  type ProductPublicationHistory,
  type PublicationPreview,
  type PublicationActionInput,
} from '../../../api/products';
import { listShopifyPublications, type ShopifyPublicationOption } from '../../../api/shopify';
import type { ProductInventoryRow } from '../../../api/channel-operations';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { ChannelBrandIcon } from '../../../components/common/ChannelBrandIcon';
import { Modal } from '../../../components/ui/Modal';
import { newIdempotencyKey } from '../product.write';
import { ProductInventorySync } from './ProductInventorySync';
import { ProductChannelActionCard, ProductChannelNotice, ProductChannelProgressNotice, ProductChannelStatusGrid } from './ProductChannelUi';

const publicationLabels: Record<string, string> = {
  not_exported: 'Chưa gửi', draft: 'Bản nháp', preflight_failed: 'Kiểm tra chưa đạt', queued: 'Đang chờ gửi',
  publishing: 'Đang tạo', published: 'Đang bán', unpublished: 'Đã dừng bán', sync_pending: 'Đang đồng bộ',
  sync_failed: 'Đồng bộ thất bại', conflict: 'Có xung đột', verification_pending: 'Chờ xác minh', verified: 'Đã xác minh', blocked: 'Bị chặn',
};
const mappingLabels: Record<string, string> = {
  unmapped: 'Chưa ghép ID', mapped: 'Đã ghép ID', conflict: 'Xung đột ID', verification_pending: 'Chờ xác minh ID', verified: 'Đã xác minh ID',
};
const syncLabels: Record<string, string> = {
  not_synced: 'Chưa gửi', sync_pending: 'Đang chờ', syncing: 'Đang gửi', sync_failed: 'Thất bại',
  conflict: 'Có xung đột', verification_pending: 'Chờ đọc lại', verified: 'Đã đọc lại', blocked: 'Bị chặn',
};
const actionGroups: { title: string; description: string; actions: { value: PublicationActionInput['operation']; label: string }[] }[] = [
  { title: 'Thông tin sản phẩm', description: 'Tạo hoặc cập nhật bản nháp, gồm cả giá bán.', actions: [
    { value: 'draft', label: 'Tạo bản nháp' }, { value: 'catalog_sync', label: 'Cập nhật thông tin và giá' },
  ] },
  { title: 'Bán hàng', description: 'Chọn nơi bán trên Shopify rồi mở hoặc ngừng bán.', actions: [
    { value: 'publish', label: 'Đăng bán' }, { value: 'unpublish', label: 'Ngừng bán' },
  ] },
];
const operationLabels: Record<PublicationActionInput['operation'], string> = {
  draft: 'Tạo bản nháp', publish: 'Đăng bán', unpublish: 'Ngừng bán', catalog_sync: 'Đồng bộ danh mục',
  price_sync: 'Đồng bộ giá', inventory_sync: 'Đồng bộ tồn kho', inventory_activate: 'Bật theo dõi tồn kho',
};
function defaultOperation(channel: ProductChannelPublication, draftOnly: boolean): PublicationActionInput['operation'] {
  if (draftOnly) return 'draft';
  if (channel.channel_code === 'shopify' && !channel.remote_product_id) return 'draft';
  if (channel.catalog_sync_state !== 'verified') return 'catalog_sync';
  return 'publish';
}
const connectionLabels: Record<string, string> = { connected: 'Đã kết nối', disconnected: 'Chưa kết nối', error: 'Cần xử lý', syncing: 'Đang kết nối', reauthorization_required: 'Cần kết nối lại' };
const requestStateLabels: Record<string, string> = {
  queued: 'Đã tiếp nhận', publishing: 'Đang xử lý', published: 'Đang bán', unpublished: 'Đã ngừng bán',
  verified: 'Đã xác minh', completed: 'Hoàn tất', sync_pending: 'Đang đồng bộ', sync_failed: 'Đồng bộ thất bại',
  preflight_failed: 'Cần bổ sung thông tin', blocked: 'Bị chặn', conflict: 'Có xung đột', failed: 'Thất bại',
};
type PublicationConfirmation = { kind: 'action'; channel: ProductChannelPublication; operation: PublicationActionInput['operation'] }
  | { kind: 'retry'; channel: ProductChannelPublication; requestId: string };

const publicationIssueMessages: Record<string, string> = {
  CHANNEL_OPERATION_UNSUPPORTED: 'Kênh bán này chưa hỗ trợ thao tác đã chọn.',
  CHANNEL_NOT_CONNECTED: 'Kênh chưa kết nối hoặc chưa được xác minh. Hãy kiểm tra kết nối trước khi gửi sản phẩm.',
  SHOPIFY_CONNECTION_NOT_VERIFIED: 'Chưa xác minh được cửa hàng Shopify. Hãy kiểm tra kết nối và thông tin shop rồi thử lại.',
  SHOPIFY_PRODUCT_WRITE_SCOPE_MISSING: 'Cửa hàng chưa cấp đủ quyền để gửi thông tin sản phẩm. Hãy cập nhật quyền kết nối Shopify.',
  SHOPIFY_PUBLICATION_SCOPE_MISSING: 'OctoFlow chưa có bằng chứng mới nhất về quyền write_publications của cửa hàng này. Sau khi cấp quyền trong Shopify Admin, vào Cài đặt kênh Shopify, chạy “Xác minh quyền (chỉ đọc)” rồi thử lại.',
  SHOPIFY_PUBLICATION_REQUIRED: 'Hãy chọn nơi khách mua hàng đang có trong cửa hàng Shopify.',
  SHOPIFY_INVENTORY_SCOPE_MISSING: 'Cửa hàng chưa cấp đủ quyền đọc và cập nhật tồn kho. Hãy kiểm tra quyền kết nối và địa điểm quản lý hàng.',
  PRODUCT_NOT_PUBLISHABLE: 'Hãy chuyển sản phẩm sang Đang bán trong mục Vòng đời và tác vụ danh mục trước khi tạo bản nháp Shopify.',
  CURRENCY_MISMATCH: 'Đơn vị tiền tệ của sản phẩm cần khớp với cửa hàng bán.',
  PRODUCT_VARIANTS_REQUIRED: 'Sản phẩm chưa có mẫu mã kèm SKU hợp lệ. Hãy thêm ít nhất một mẫu mã trước khi đăng.',
  PRODUCT_VARIANTS_INCOMPLETE: 'Một số mẫu mã còn thiếu SKU, màu sắc, kích cỡ hoặc giá hợp lệ. Hãy hoàn thiện thông tin rồi thử lại.',
  PRODUCT_IMAGE_REQUIRED: 'Hãy thêm ít nhất một ảnh sản phẩm trong OctoFlow trước khi tạo bản nháp Shopify.',
  SHOPIFY_CHANNEL_PRICE_REQUIRED: 'Giá hiệu lực của từng SKU cần lớn hơn 0; Shopify có thể dùng giá Core hoặc giá riêng theo kênh.',
  SHOPIFY_DRAFT_REQUIRED: 'Hãy tạo bản nháp Shopify trước khi cập nhật thông tin sản phẩm trên kênh.',
  MAPPING_CONFLICT: 'Thông tin liên kết sản phẩm trên kênh đang bị trùng hoặc xung đột. Hãy kiểm tra phần ghép SKU.',
  REMOTE_OWNERSHIP_CONFLICT: 'Mã sản phẩm đã lưu trên kênh không khớp với sản phẩm này. Hãy đối soát liên kết trước khi gửi lại.',
  SHOPIFY_CATALOG_NOT_VERIFIED: 'Chưa xác minh được sản phẩm trên Shopify. Hãy gửi thông tin sản phẩm trước, sau đó kiểm tra lại sản phẩm trên cửa hàng.',
  SHOPIFY_MAPPING_NOT_READY: 'Chưa sẵn sàng đăng bán: kiểm tra liên kết SKU, mã tồn và địa điểm Shopify.',
  SHOPIFY_INVENTORY_ACTIVATION_DISABLED: 'Máy chủ chưa bật chức năng chuẩn bị tồn Shopify khi đăng bán.',
  SHOPIFY_PUBLICATION_NOT_OWNED: 'Hãy chọn nơi đăng bán hiện do OctoFlow quản lý trước khi ngừng bán.',
  SHOPIFY_INVENTORY_MAPPING_REQUIRED: 'Chưa liên kết được mã hàng tồn kho cho từng SKU. Hãy gửi sản phẩm lên Shopify và xác minh các mã hàng trước.',
  PRODUCT_PUBLIC_IMAGE_URL_REQUIRED: 'Ảnh sản phẩm cần có đường dẫn HTTPS công khai trước khi đăng lên eBay.',
  CHANNEL_CONNECTION_ERROR: 'Kết nối kênh đang gặp sự cố. Hãy kiểm tra kết nối rồi thử lại.',
};

const publicationFailureMessages: Record<string, string> = {
  PRODUCT_SET_METAFIELD_MISMATCH: 'Shopify từ chối mã định danh sản phẩm trong dữ liệu gửi lên.',
  SHOPIFY_OVERSALE_POLICY: 'Shopify đang cho bán tiếp khi hết hàng. Tắt tùy chọn này cho mọi SKU rồi đăng bán lại.',
  SHOPIFY_EXISTING_STOCK_REQUIRES_REVIEW: 'Shopify đang có tồn khác 0. Kiểm tra tồn và đơn đang mở trên Shopify; chỉ đăng lại khi số tồn đã được xử lý an toàn. OctoFlow không tự đặt lại về 0.',
  SHOPIFY_INVENTORY_ACTIVATION_DISABLED: 'Máy chủ chưa bật chức năng chuẩn bị tồn Shopify khi đăng bán.',
};

function publicationFailureMessage(code: string): string {
  return publicationFailureMessages[code] ?? 'Shopify chưa xác nhận lần gửi này. Xem mã lỗi và lịch sử để xác định nguyên nhân.';
}

function publicationIssueMessage(issue: { code: string; message: string }): string {
  return publicationIssueMessages[issue.code] ?? 'Chưa đủ điều kiện để thực hiện thao tác. Hãy kiểm tra thông tin sản phẩm và kết nối kênh rồi thử lại.';
}
function userError(cause: unknown, fallback: string): string {
  if (!(cause instanceof ApiRequestError)) return fallback;
  const presentation = presentApiError(cause);
  return presentation.requestId ? `${presentation.detail} (Mã yêu cầu: ${presentation.requestId})` : presentation.detail;
}

function formattedTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' });
}

function tone(state: string): 'neutral' | 'success' | 'warning' | 'danger' {
  if (['published', 'verified', 'draft', 'mapped'].includes(state)) return 'success';
  if (['sync_failed', 'conflict', 'blocked', 'preflight_failed'].includes(state)) return 'danger';
  if (['queued', 'publishing', 'sync_pending', 'syncing', 'verification_pending'].includes(state)) return 'warning';
  return 'neutral';
}

type PublishStageState = 'done' | 'active' | 'pending' | 'error';
type PublishStage = { label: string; detail: string; state: PublishStageState };

function stageState(done: boolean, active: boolean, failed: boolean): PublishStageState {
  return failed ? 'error' : done ? 'done' : active ? 'active' : 'pending';
}

function shopifyProgressStages(channel: ProductChannelPublication, rows: ProductInventoryRow[]): PublishStage[] {
  const publicationState = channel.publication_state;
  const working = ['queued', 'publishing'].includes(publicationState);
  const published = ['published', 'sync_pending', 'verification_pending', 'verified'].includes(publicationState);
  const failed = ['sync_failed', 'conflict', 'blocked'].includes(publicationState);
  const listedRows = rows.filter((row) => row.listed);
  const targetRows = listedRows.filter((row) => row.target_quantity != null);
  const verifiedRows = listedRows.filter((row) => row.latest_sync_status === 'VERIFIED');
  const inventoryErrors = listedRows.filter((row) => Boolean(row.latest_sync_error_code) || ['failed', 'dead'].includes(row.latest_job_status ?? ''));
  const allTargets = listedRows.length > 0 && targetRows.length === listedRows.length;
  const allVerified = listedRows.length > 0 && verifiedRows.length === listedRows.length;
  const trackingReady = published || channel.inventory_sync_state !== 'not_synced' || rows.some((row) => row.inventory_tracking_enabled);
  return [
    {
      label: 'Kiểm tra Shopify',
      detail: publicationState === 'preflight_failed' ? 'Còn điều kiện chưa đạt; xem lỗi bên dưới.' : working ? 'Đang kiểm tra điều kiện sản phẩm và kết nối.' : publicationState === 'not_exported' || publicationState === 'draft' ? 'Chưa gửi yêu cầu đăng bán.' : 'Điều kiện sản phẩm và kết nối đã được kiểm tra.',
      state: stageState(!working && publicationState !== 'not_exported' && publicationState !== 'draft', working, publicationState === 'preflight_failed'),
    },
    {
      label: 'Chuẩn bị quản lý tồn kho',
      detail: published ? 'Shopify đã bật theo dõi tồn tự động trong cùng yêu cầu đăng bán.' : working ? 'Đang bật theo dõi tồn và xác minh vị trí kho.' : trackingReady ? 'Theo dõi tồn đã được ghi nhận.' : 'Chưa bắt đầu; không cần thao tác thủ công.',
      state: stageState(trackingReady, working, failed || publicationState === 'preflight_failed'),
    },
    {
      label: 'Đăng sản phẩm',
      detail: published ? (channel.remote_product_id ? `Đã tạo sản phẩm ${channel.remote_product_id}.` : 'Shopify đã xác nhận sản phẩm.') : working ? 'Đang tạo sản phẩm trên Shopify.' : failed ? 'Shopify chưa xác nhận đăng bán.' : 'Chưa bắt đầu.',
      state: stageState(published, working, failed || publicationState === 'preflight_failed'),
    },
    {
      label: 'Phân bổ tồn kho',
      detail: allTargets ? `${targetRows.length} SKU đã có hạn mức từ Core.` : published ? 'Đang chờ Core tính hạn mức cho từng SKU đang bán.' : 'Chỉ tính sau khi sản phẩm được đăng bán.',
      state: stageState(allTargets, published, inventoryErrors.length > 0),
    },
    {
      label: 'Đồng bộ tồn Shopify',
      detail: allVerified ? `${verifiedRows.length}/${listedRows.length} SKU đã được Shopify đọc lại.` : inventoryErrors.length ? 'Có SKU chưa đồng bộ được; xem lỗi trong phần tồn kho bên dưới.' : allTargets ? 'Đang gửi hạn mức và chờ Shopify đọc lại.' : 'Chưa có hạn mức để gửi.',
      state: stageState(allVerified, allTargets && !allVerified, inventoryErrors.length > 0),
    },
    {
      label: 'Sẵn sàng bán',
      detail: published && allVerified ? 'Tồn trên Shopify đã được xác minh cho mọi SKU đang bán.' : published ? 'Chưa thể kết luận sẵn sàng bán cho tới khi tồn được đọc lại đúng.' : 'Chưa bắt đầu.',
      state: stageState(published && allVerified, published && !allVerified, false),
    },
  ];
}

const publishStageTone: Record<PublishStageState, 'neutral' | 'success' | 'warning' | 'danger'> = {
  done: 'success', active: 'warning', pending: 'neutral', error: 'danger',
};
const publishStageLabel: Record<PublishStageState, string> = {
  done: 'Hoàn tất', active: 'Đang chạy', pending: 'Chưa bắt đầu', error: 'Cần xử lý',
};

export function ProductPublicationPanel({ productId, productVersion, canWrite, channelFilter, channelCodeFilter, draftOnly = false, wizardMode = false, readOnlyWhileProcessing = false, onDraftPreview, onDraftSubmitReady, onDraftQueued }: {
  productId: string;
  productVersion: number;
  canWrite: boolean;
  channelFilter?: string;
  channelCodeFilter?: string;
  draftOnly?: boolean;
  wizardMode?: boolean;
  readOnlyWhileProcessing?: boolean;
  onDraftPreview?: (preview: PublicationPreview) => void;
  onDraftSubmitReady?: (submit: (() => Promise<void>) | null) => void;
  onDraftQueued?: (result: Pick<import('../../../api/products').PublicationRequestResult, 'id' | 'state'>) => void;
}) {
  const [collection, setCollection] = useState<ProductPublicationCollection | null>(null);
  const [statusLoadError, setStatusLoadError] = useState<string | null>(null);
  const [shopifyPublications, setShopifyPublications] = useState<ShopifyPublicationOption[]>([]);
  const [publicationsLoading, setPublicationsLoading] = useState(false);
  const [publicationsError, setPublicationsError] = useState<string | null>(null);
  const [publicationsAttempt, setPublicationsAttempt] = useState(0);
  const [previews, setPreviews] = useState<Record<string, PublicationPreview>>({});
  const [selectedOperations, setSelectedOperations] = useState<Record<string, PublicationActionInput['operation']>>({});
  const [selectedPublicationIDs, setSelectedPublicationIDs] = useState<Record<string, string>>({});
  const [inventoryRows, setInventoryRows] = useState<Record<string, ProductInventoryRow[]>>({});
  const [histories, setHistories] = useState<Record<string, ProductPublicationHistory | undefined>>({});
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({});
  const [busyChannel, setBusyChannel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<PublicationConfirmation | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const result = await listProductPublications(productId, signal);
    setCollection(result);
    setStatusLoadError(null);
  }, [productId]);

  const receiveInventoryRows = useCallback((channelId: string, rows: ProductInventoryRow[]) => {
    setInventoryRows((current) => current[channelId] === rows ? current : { ...current, [channelId]: rows });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setCollection(null);
    setStatusLoadError(null);
    setShopifyPublications([]);
    setPreviews({});
    setInventoryRows({});
    setHistories({});
    setHistoryOpen({});
    setSelectedOperations({});
    setSelectedPublicationIDs({});
    setError(null);
    void refresh(controller.signal).catch((cause: unknown) => {
      if (!controller.signal.aborted) setStatusLoadError(userError(cause, 'Không thể tải trạng thái sản phẩm. Hãy thử lại.'));
    });
    return () => controller.abort();
  }, [refresh, productVersion]);

  const retryStatusLoad = async () => {
    setStatusLoadError(null);
    try {
      await refresh();
    } catch (cause) {
      setStatusLoadError(userError(cause, 'Không thể tải trạng thái sản phẩm. Hãy thử lại.'));
    }
  };

  const channels = useMemo(() => (collection?.channels ?? []).filter((channel) =>
    (!channelFilter || channel.channel_id === channelFilter) && (!channelCodeFilter || channel.channel_code === channelCodeFilter)),
  [channelCodeFilter, channelFilter, collection]);
  const hasProcessingPublication = channels.some((channel) => channel.channel_code === 'shopify' && ['queued', 'publishing', 'sync_pending', 'verification_pending'].includes(channel.publication_state));
  useEffect(() => {
    if (!hasProcessingPublication) return;
    const controller = new AbortController();
    let active = true;
    let inFlight = false;
    const poll = async () => {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      try {
        await refresh(controller.signal);
      } catch (cause) {
        if (active && !controller.signal.aborted) setStatusLoadError(userError(cause, 'Không thể tự làm mới tiến trình. Hãy thử tải lại.'));
      } finally {
        inFlight = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, [hasProcessingPublication, refresh]);
  useEffect(() => {
    if (!readOnlyWhileProcessing || !channelFilter) return;
    let cancelled = false;
    setHistoryOpen((current) => ({ ...current, [channelFilter]: true }));
    void getProductPublicationHistory(productId, channelFilter).then((history) => {
      if (!cancelled) setHistories((current) => ({ ...current, [channelFilter]: history }));
    }).catch((cause: unknown) => {
      if (!cancelled) setError(userError(cause, 'Không thể tải tiến trình. Hãy thử làm mới.'));
    });
    return () => { cancelled = true; };
  }, [channelFilter, productId, readOnlyWhileProcessing]);
  const publicationTargetNeeded = useMemo(() => !draftOnly && channels.some((channel) =>
    channel.channel_code === 'shopify' && ['publish', 'unpublish'].includes(selectedOperations[channel.channel_id] ?? defaultOperation(channel, draftOnly)),
  ), [channels, draftOnly, selectedOperations]);

  useEffect(() => {
    if (!publicationTargetNeeded) {
      setShopifyPublications([]);
      setPublicationsError(null);
      setPublicationsLoading(false);
      return;
    }
    const controller = new AbortController();
    setPublicationsLoading(true);
    setPublicationsError(null);
    void listShopifyPublications(controller.signal).then((publications) => {
      if (controller.signal.aborted) return;
      setShopifyPublications(publications);
      const onlyPublication = publications.length === 1 ? publications[0] : undefined;
      const publicationIDs = new Set(publications.map((publication) => publication.id));
      setSelectedPublicationIDs((current) => {
        let changed = false;
        const next = { ...current };
        for (const channel of channels) {
          if (channel.channel_code !== 'shopify') continue;
          const currentID = next[channel.channel_id];
          if (onlyPublication && currentID !== onlyPublication.id) {
            next[channel.channel_id] = onlyPublication.id;
            changed = true;
          } else if (currentID && !publicationIDs.has(currentID)) {
            next[channel.channel_id] = '';
            changed = true;
          }
        }
        return changed ? next : current;
      });
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setPublicationsError(userError(cause, 'Không thể tải danh sách nơi khách mua hàng trên Shopify. Hãy thử lại.'));
    }).finally(() => {
      if (!controller.signal.aborted) setPublicationsLoading(false);
    });
    return () => controller.abort();
  }, [channels, publicationTargetNeeded, publicationsAttempt]);

  useEffect(() => {
    if (!collection) return;
    setSelectedPublicationIDs((current) => {
      const next = { ...current };
      for (const channel of collection.channels) {
        if (channel.remote_publication_id && !next[channel.channel_id]) next[channel.channel_id] = channel.remote_publication_id;
      }
      return next;
    });
  }, [collection]);

  const runPreview = async (channel: ProductChannelPublication, operation: PublicationActionInput['operation']) => {
    setBusyChannel(channel.channel_id);
    setError(null);
    setNotice(null);
    try {
      const preview = await previewProductPublication(productId, {
        channel_id: channel.channel_id, operation, expected_product_version: productVersion,
        ...(['publish', 'unpublish'].includes(operation) && selectedPublicationIDs[channel.channel_id]
          ? { publication_id: selectedPublicationIDs[channel.channel_id] }
          : {}),
      });
      setPreviews((current) => ({ ...current, [`${channel.channel_id}:${operation}`]: preview }));
      if (operation === 'draft') {
        onDraftPreview?.(preview);
        onDraftSubmitReady?.(preview.supported && preview.ready ? () => createDraft(channel, preview) : null);
      }
    } catch (cause) {
      setError(userError(cause, 'Không thể kiểm tra điều kiện lúc này. Hãy thử lại.'));
    } finally {
      setBusyChannel(null);
    }
  };

  const createLifecycleAction = async (channel: ProductChannelPublication, operation: PublicationActionInput['operation']) => {
    const preview = previews[`${channel.channel_id}:${operation}`];
    const publicationId = selectedPublicationIDs[channel.channel_id];
    if (!preview?.supported || !preview.ready || !canWrite) return;
    setBusyChannel(channel.channel_id);
    setError(null);
    setNotice(null);
    try {
      const result = await createProductPublication(productId, {
        channel_id: channel.channel_id,
        operation,
        expected_product_version: productVersion,
        confirm: true,
        ...(['publish', 'unpublish'].includes(operation) ? { publication_id: publicationId } : {}),
      }, newIdempotencyKey(`publication-${operation}`));
      setNotice(result.state === 'preflight_failed' ? 'Yêu cầu đã nhận nhưng còn điều kiện cần xử lý.' : 'Đã gửi yêu cầu lên kênh.');
      setPreviews((current) => { const next = { ...current }; delete next[`${channel.channel_id}:${operation}`]; return next; });
      setHistories((current) => ({ ...current, [channel.channel_id]: undefined }));
      await refresh();
    } catch (cause) {
      setError(userError(cause, 'Không thể gửi thao tác lên kênh. Hãy thử lại.'));
    } finally {
      setBusyChannel(null);
    }
  };

  const createDraft = async (channel: ProductChannelPublication, checkedPreview?: PublicationPreview) => {
    const preview = checkedPreview ?? previews[`${channel.channel_id}:draft`];
    if (!preview?.supported || !preview.ready || !canWrite) return;
    setBusyChannel(channel.channel_id);
    setError(null);
    setNotice(null);
    try {
      const history = await getProductPublicationHistory(productId, channel.channel_id);
      const sameVersionRequests = history.requests.filter((request) =>
        request.product_version === productVersion && ['draft', 'retry'].includes(request.operation),
      );
      const latestRequest = sameVersionRequests[0];
      if (latestRequest && ['queued', 'publishing', 'sync_pending'].includes(latestRequest.state)) {
        setNotice('Đã có yêu cầu tạo bản nháp đang xử lý; OctoFlow không gửi yêu cầu trùng.');
        onDraftQueued?.({ id: latestRequest.id, state: latestRequest.state });
        return;
      }
      if (latestRequest && ['verified', 'draft'].includes(latestRequest.state)) {
        setNotice('Bản nháp đã được tạo cho phiên bản này. Chọn “Cập nhật thông tin và giá” nếu muốn gửi thay đổi; OctoFlow không tạo bản nháp trùng.');
        onDraftQueued?.({ id: latestRequest.id, state: latestRequest.state });
        return;
      }
      if (latestRequest?.state === 'conflict') {
        setNotice('Yêu cầu tạo bản nháp đang có xung đột. Hãy xem lịch sử đăng sản phẩm trước khi thử lại.');
        onDraftQueued?.({ id: latestRequest.id, state: latestRequest.state });
        return;
      }

      const failedDraft = sameVersionRequests.find((request) =>
        request.operation === 'draft' && ['sync_failed', 'blocked'].includes(request.state),
      );
      const result = failedDraft
        ? await retryProductPublication(productId, channel.channel_id, failedDraft.id, newIdempotencyKey('publication-retry'))
        : await createProductPublication(productId, {
          channel_id: channel.channel_id, operation: 'draft', expected_product_version: productVersion,
        }, newIdempotencyKey('publication-draft'));
      setPreviews((current) => {
        const next = { ...current };
        delete next[`${channel.channel_id}:draft`];
        return next;
      });
      setNotice(result.state === 'preflight_failed' ? 'Yêu cầu đã nhận nhưng còn điều kiện cần xử lý.' : ['queued', 'publishing', 'sync_pending'].includes(result.state) ? 'Đã gửi yêu cầu tạo bản nháp.' : 'Bản nháp đã được tạo và xác minh trên Shopify.');
      onDraftQueued?.(result);
      await refresh();
    } catch (cause) {
      setError(userError(cause, 'Không thể tạo bản nháp lúc này. Hãy thử lại.'));
      if (wizardMode) throw cause;
    } finally {
      setBusyChannel(null);
    }
  };

  const toggleHistory = async (channel: ProductChannelPublication) => {
    const open = !historyOpen[channel.channel_id];
    setHistoryOpen((current) => ({ ...current, [channel.channel_id]: open }));
    if (open && !histories[channel.channel_id]) {
      try {
        const history = await getProductPublicationHistory(productId, channel.channel_id);
        setHistories((current) => ({ ...current, [channel.channel_id]: history }));
      } catch (cause) {
        setError(userError(cause, 'Không thể tải lịch sử đăng sản phẩm. Hãy thử lại.'));
      }
    }
  };

  const refreshProgress = async (channel: ProductChannelPublication) => {
    setBusyChannel(channel.channel_id);
    setError(null);
    try {
      const [history] = await Promise.all([
        getProductPublicationHistory(productId, channel.channel_id),
        refresh(),
      ]);
      setHistories((current) => ({ ...current, [channel.channel_id]: history }));
      setHistoryOpen((current) => ({ ...current, [channel.channel_id]: true }));
    } catch (cause) {
      setError(userError(cause, 'Không thể làm mới tiến trình. Hãy thử lại.'));
    } finally {
      setBusyChannel(null);
    }
  };

  const retry = async (channel: ProductChannelPublication, requestId: string) => {
    setBusyChannel(channel.channel_id);
    setError(null);
    setNotice(null);
    try {
      await retryProductPublication(productId, channel.channel_id, requestId, newIdempotencyKey('publication-retry'));
      setNotice('Đã gửi yêu cầu thử lại.');
      setHistories((current) => ({ ...current, [channel.channel_id]: undefined }));
      await refresh();
    } catch (cause) {
      setError(userError(cause, 'Không thể gửi yêu cầu thử lại. Hãy thử lại sau.'));
    } finally {
      setBusyChannel(null);
    }
  };

  const confirmPendingAction = async () => {
    const current = confirmation;
    if (!current) return;
    setConfirmation(null);
    if (current.kind === 'retry') await retry(current.channel, current.requestId);
    else if (current.operation === 'draft') await createDraft(current.channel);
    else await createLifecycleAction(current.channel, current.operation);
  };

  return (
    <section role="region" className="grid gap-4" aria-label="Quản lý đăng sản phẩm đa kênh">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-outline-variant/60 pb-4">
        <div>
          <p className="font-body text-caption font-semibold uppercase tracking-[0.12em] text-octo-ember">HIỆN DIỆN TRÊN KÊNH</p>
          <h2 className="mt-1 font-display text-xl font-bold text-on-surface">Đăng và đồng bộ</h2>
        </div>
        {channels.length ? <StatusBadge tone="neutral">{channels.length} {channels.length === 1 ? 'kênh' : 'kênh'}</StatusBadge> : null}
      </header>

      {error ? <ProductChannelNotice kind="error">{error}</ProductChannelNotice> : null}
      {statusLoadError ? <ProductChannelNotice kind="error"><div className="flex flex-wrap items-center justify-between gap-3"><span>{statusLoadError}</span><Button size="sm" variant="secondary" onClick={() => void retryStatusLoad()}>Tải lại trạng thái</Button></div></ProductChannelNotice> : null}
      {notice ? <ProductChannelNotice kind="success">{notice}</ProductChannelNotice> : null}
      {!collection && !error && !statusLoadError ? <p className="font-body text-body-sm text-graphite">Đang tải trạng thái đăng bán…</p> : null}
      {collection && channels.length === 0 ? <p className="rounded-lg border border-sandstone bg-channel-paper p-4 font-body text-body-sm text-graphite">{channelCodeFilter === 'lazada' ? 'Chưa có gian hàng Lazada kết nối để hiển thị mapping sản phẩm.' : 'Sản phẩm chưa có kênh đăng bán.'}</p> : null}

      <div className="grid gap-4">
        {channels.map((channel) => {
          const selectedOperation = selectedOperations[channel.channel_id] ?? defaultOperation(channel, draftOnly);
          const selectedPreview = previews[`${channel.channel_id}:${selectedOperation}`];
          const lazadaReadOnly = channel.channel_code === 'lazada';
          const selectedPublicationID = selectedPublicationIDs[channel.channel_id] ?? '';
          const selectedPublicationAvailable = shopifyPublications.some((publication) => publication.id === selectedPublicationID);
          const history = histories[channel.channel_id];
          const isBusy = busyChannel === channel.channel_id;
          const channelIsProcessing = channel.channel_code === 'shopify' && ['queued', 'publishing', 'sync_pending', 'verification_pending'].includes(channel.publication_state);
          const processing = channelIsProcessing || (readOnlyWhileProcessing && (!history || history.requests.some((request) => ['queued', 'publishing', 'sync_pending'].includes(request.state))));
          const showWorkingIndicator = processing;
          const previewTone = selectedPreview?.ready ? 'success' : selectedPreview?.supported ? 'danger' : 'neutral';
          const showPublication = channel.channel_code === 'shopify' && ['publish', 'unpublish'].includes(selectedOperation);
          const channelInventory = inventoryRows[channel.channel_id] ?? [];
          const progressStages = channel.channel_code === 'shopify' ? shopifyProgressStages(channel, channelInventory) : [];
          const showProgress = channel.channel_code === 'shopify' && !draftOnly && channel.publication_state === 'published' && !processing;
          const canCreateSelectedDraft = selectedOperation !== 'draft' || channel.can_create_draft;
          const canConfirm = Boolean(selectedPreview?.supported && selectedPreview.ready && canWrite && canCreateSelectedDraft && !isBusy && !processing);
          return (
            <article key={channel.channel_id} className="grid gap-4 rounded-lg border border-sandstone bg-pure-white p-4 sm:p-5">
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-channel-paper text-carbon"><ChannelBrandIcon code={channel.channel_code} /></span>
                  <div className="min-w-0">
                    <h3 className="break-words font-body text-base font-semibold text-on-surface">{channel.channel_name}</h3>
                    <p className="mt-1 font-body text-caption text-graphite">{connectionLabels[channel.connection_state] ?? 'Trạng thái kết nối chưa rõ'}</p>
                  </div>
                </div>
                <StatusBadge tone={tone(lazadaReadOnly ? channel.mapping_state : channel.publication_state)}>{lazadaReadOnly ? mappingLabels[channel.mapping_state] ?? 'Mapping chưa rõ' : publicationLabels[channel.publication_state] ?? 'Đang cập nhật'}</StatusBadge>
              </header>

              <ProductChannelStatusGrid items={lazadaReadOnly ? [
                { label: 'Ghép SKU Lazada', value: mappingLabels[channel.mapping_state] ?? 'Đang cập nhật', tone: tone(channel.mapping_state) },
                { label: 'Mã sản phẩm remote', value: channel.remote_product_id ? 'Đã nhận diện' : 'Chưa ghép', tone: channel.remote_product_id ? 'success' : 'neutral' },
                { label: 'Đồng bộ tồn kho', value: channel.inventory_sync_state === 'verified' ? 'Đã xác minh' : 'Chưa đồng bộ', tone: channel.inventory_sync_state === 'verified' ? 'success' : 'neutral' },
              ] : [
                { label: 'Ghép mã sản phẩm', value: mappingLabels[channel.mapping_state] ?? 'Đang cập nhật', tone: tone(channel.mapping_state) },
                { label: 'Thông tin và giá', value: syncLabels[channel.catalog_sync_state] ?? 'Đang cập nhật', tone: tone(channel.catalog_sync_state) },
                { label: 'Tồn kho trên kênh', value: syncLabels[channel.inventory_sync_state] ?? 'Đang cập nhật', tone: tone(channel.inventory_sync_state) },
              ]} />

              {lazadaReadOnly && channel.remote_product_id ? <p className="text-caption text-graphite">Mã sản phẩm Lazada: <code className="break-all font-mono text-on-surface">{channel.remote_product_id}</code></p> : null}

              {showProgress ? <section className="grid gap-2 rounded-lg border border-outline-variant/60 bg-surface-container-low p-3" aria-label={`Tiến trình đăng bán ${channel.channel_name}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h4 className="font-body text-sm font-semibold text-on-surface">Tiến trình đăng bán</h4>
                </div>
                <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{progressStages.map((stage, index) => <li key={stage.label} className={`flex min-w-0 items-start gap-2 rounded-control border bg-pure-white p-2.5 ${stage.state === 'error' ? 'border-error/30' : stage.state === 'done' ? 'border-badge-progress-text/25' : 'border-outline-variant/60'}`}>
                  <span aria-hidden="true" className={`material-symbols-outlined mt-0.5 text-base ${stage.state === 'done' ? 'text-badge-progress-text' : stage.state === 'error' ? 'text-error' : stage.state === 'active' ? 'text-badge-blocked-text motion-safe:animate-spin' : 'text-graphite'}`}>{stage.state === 'done' ? 'check_circle' : stage.state === 'error' ? 'error' : stage.state === 'active' ? 'progress_activity' : 'radio_button_unchecked'}</span>
                  <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-on-surface">Bước {index + 1} · {stage.label}</p><p className="mt-0.5 text-caption leading-4 text-graphite">{stage.detail}</p></div>
                  <StatusBadge tone={publishStageTone[stage.state]}>{publishStageLabel[stage.state]}</StatusBadge>
                </li>)}</ol>
              </section> : null}

              {showWorkingIndicator ? <ProductChannelProgressNotice channelName={channel.channel_name} refreshing={isBusy} onRefresh={() => void refreshProgress(channel)} detail={channel.publication_state === 'queued' ? 'Yêu cầu đang chờ worker tiếp nhận.' : channel.publication_state === 'sync_pending' ? 'Lần gửi chưa hoàn tất; hệ thống đang tự thử lại.' : channel.publication_state === 'verification_pending' ? 'Đang đọc lại kết quả từ Shopify.' : 'Shopify đang tạo hoặc cập nhật sản phẩm.'} /> : null}

              {channel.last_error_code ? <ProductChannelNotice kind="error"><div className="flex flex-wrap items-center justify-between gap-3 text-caption">
                <div className="grid gap-1">
                  <strong>Lần gửi gần nhất chưa hoàn tất.</strong>
                  <span>{publicationFailureMessage(channel.last_error_code)}</span>
                  <code className="break-all font-mono">Mã lỗi: {channel.last_error_code}</code>
                </div>
                <Button size="sm" variant="secondary" onClick={() => void toggleHistory(channel)}>Xem lần xử lý</Button>
              </div></ProductChannelNotice> : null}

              {lazadaReadOnly ? <ProductChannelNotice kind="info">
                {channel.mapping_state === 'unmapped'
                  ? 'SKU của sản phẩm này chưa được ghép với SKU Lazada. Đọc catalog và nhập mapping chính xác từ trang Kênh bán → Lazada trước khi phân bổ tồn.'
                  : `Mapping Lazada: ${mappingLabels[channel.mapping_state] ?? 'đang cập nhật'}. Mở mục Lazada trong trang chi tiết để thiết lập và kiểm tra điều kiện đăng sản phẩm.`}
              </ProductChannelNotice> : <section className="grid gap-3 rounded-lg bg-channel-paper p-4" aria-label={`Thao tác với ${channel.channel_name}`}>
                {draftOnly ? <p className="text-sm font-semibold text-on-surface">Tạo bản nháp</p> : <div className="grid gap-3 lg:grid-cols-2" aria-label={`Nhóm thao tác cho ${channel.channel_name}`}>
                  {actionGroups.map((group) => <ProductChannelActionCard key={group.title} title={group.title} description={group.description}>
                    <div className="grid gap-2" role="group" aria-label={group.title}>
                      {group.actions.map((action) => <button key={action.value} type="button" aria-pressed={selectedOperation === action.value} onClick={() => {
                        setError(null);
                        setSelectedOperations((current) => ({ ...current, [channel.channel_id]: action.value }));
                      }} disabled={processing} className={`min-h-10 rounded-control border px-3 py-2 text-left text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-octo-ember disabled:cursor-not-allowed disabled:opacity-50 ${selectedOperation === action.value ? 'border-carbon bg-carbon text-pure-white' : 'border-outline-variant bg-warm-alabaster text-on-surface hover:border-carbon'}`}>{action.label}</button>)}
                    </div>
                  </ProductChannelActionCard>)}
                </div>}
                <div className="grid gap-3 md:grid-cols-[minmax(12rem,1fr)_auto] md:items-end">
                  {showPublication ? <div className="grid gap-1.5">
                    <span className="font-body text-caption font-semibold text-on-surface">Nơi khách mua hàng</span>
                    {publicationsLoading ? <p role="status" className="min-h-11 content-center rounded-control border border-sandstone bg-warm-alabaster px-3 text-body-sm text-graphite">Đang tải lựa chọn từ Shopify…</p> : null}
                    {!publicationsLoading && !publicationsError && shopifyPublications.length === 1 ? <div className="min-h-11 content-center rounded-control border border-sandstone bg-warm-alabaster px-3 text-body-sm text-on-surface">
                      {shopifyPublications[0]?.name}<span className="ml-2 text-caption text-graphite">· tự chọn vì cửa hàng chỉ có một nơi bán</span>
                    </div> : null}
                    {!publicationsLoading && !publicationsError && shopifyPublications.length > 1 ? <select aria-label={`Chọn nơi khách mua hàng trên ${channel.channel_name}`} className="min-h-11 rounded-control border border-sandstone bg-pure-white px-3 text-body-sm font-normal disabled:cursor-not-allowed disabled:bg-warm-alabaster" value={selectedPublicationID} disabled={isBusy} onChange={(event) => {
                      const value = event.target.value;
                      setSelectedPublicationIDs((current) => ({ ...current, [channel.channel_id]: value }));
                      setPreviews((current) => { const next = { ...current }; delete next[`${channel.channel_id}:publish`]; delete next[`${channel.channel_id}:unpublish`]; return next; });
                    }}>
                      <option value="">Chọn nơi khách mua hàng</option>
                      {shopifyPublications.map((publication) => <option key={publication.id} value={publication.id}>{publication.name}</option>)}
                    </select> : null}
                    {publicationsError ? <div className="flex flex-wrap items-center gap-2 text-caption leading-5 text-badge-blocked-text"><span role="alert">{publicationsError}</span><Button size="sm" variant="ghost" disabled={publicationsLoading} onClick={() => setPublicationsAttempt((value) => value + 1)}>Thử tải lại</Button></div> : null}
                    {!publicationsLoading && !publicationsError && shopifyPublications.length === 0 ? <p role="status" className="text-caption leading-5 text-graphite">Shopify chưa trả về nơi bán khả dụng. Kiểm tra quyền read_publications của app và trạng thái các kênh trong Shopify.</p> : null}
                  </div> : <p className="self-center text-xs leading-5 text-graphite">{selectedOperation === 'inventory_activate' ? 'Bật theo dõi cho từng mẫu mã tại địa điểm Shopify. Số lượng ban đầu là 0.' : selectedOperation === 'catalog_sync' ? 'Cập nhật mô tả, mẫu mã và giá từ Core.' : 'Kiểm tra điều kiện trước khi gửi.'}</p>}
                  <Button size="sm" variant="secondary" disabled={isBusy || processing || (showPublication && (publicationsLoading || Boolean(publicationsError) || !selectedPublicationAvailable))} loading={isBusy} onClick={() => void runPreview(channel, selectedOperation)}>
                    Kiểm tra điều kiện
                  </Button>
                </div>

                {showPublication && !selectedPublicationID && shopifyPublications.length > 1 && !publicationsError ? <p className="text-caption text-graphite">Chọn nơi khách mua hàng để tiếp tục.</p> : null}

                {selectedPreview ? <div role="region" className="grid gap-3 rounded-lg border border-sandstone bg-pure-white p-4" aria-label={`Kết quả kiểm tra ${channel.channel_name}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-body text-caption text-graphite">{operationLabels[selectedOperation]}</p>
                      <h4 className="mt-1 font-body text-base font-semibold text-on-surface">{selectedPreview.ready ? (selectedOperation === 'draft' ? 'Đủ điều kiện tạo bản nháp' : 'Có thể tiếp tục') : selectedPreview.supported ? 'Cần xử lý trước khi tiếp tục' : 'Thao tác chưa khả dụng'}</h4>
                    </div>
                    <StatusBadge tone={previewTone}>{selectedPreview.ready ? (selectedOperation === 'draft' ? 'Có thể gửi' : 'Đã sẵn sàng') : selectedPreview.supported ? 'Cần kiểm tra' : 'Chưa hỗ trợ'}</StatusBadge>
                  </div>
                  {!selectedPreview.supported && selectedPreview.issues.length === 0 ? <p className="text-body-sm text-graphite">Kênh này chưa hỗ trợ thao tác đã chọn.</p> : null}
                  {selectedPreview.issues.map((issue, index) => <p key={`${issue.code}-${index}`} className="text-body-sm leading-5 text-error">{publicationIssueMessage(issue)}</p>)}
                  {selectedPreview.ready && selectedOperation === 'draft' ? <p className="text-caption leading-5 text-graphite">Dữ liệu hiện tại đủ điều kiện để gửi. Kết quả kiểm tra này chưa xóa lỗi lần gửi trước; sau khi bạn xác nhận, OctoFlow sẽ gửi hoặc thử lại yêu cầu tạo bản nháp.</p> : null}
                  {selectedPreview.ready && !wizardMode ? <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/50 pt-3">
                    <p className="text-caption text-graphite">{canWrite ? 'Xác nhận để gửi thao tác lên kênh.' : 'Bạn không có quyền thay đổi sản phẩm trên kênh này.'}</p>
                    <Button size="sm" disabled={!canConfirm} onClick={() => setConfirmation({ kind: 'action', channel, operation: selectedOperation })}>Xác nhận {operationLabels[selectedOperation].toLocaleLowerCase('vi')}</Button>
                  </div> : null}
                </div> : null}
              </section>}

              {!draftOnly && channel.channel_code === 'shopify' ? <ProductInventorySync channelId={channel.channel_id} productId={productId} canWrite={canWrite && !processing} onRowsChange={(rows) => receiveInventoryRows(channel.channel_id, rows)} /> : null}

              {!lazadaReadOnly ? <footer className="flex justify-end border-t border-outline-variant/50 pt-3">
                <Button size="sm" variant="ghost" aria-expanded={historyOpen[channel.channel_id] ?? false} disabled={isBusy} onClick={() => void toggleHistory(channel)}>
                  {historyOpen[channel.channel_id] ? 'Ẩn lịch sử' : 'Xem lịch sử'}
                </Button>
              </footer> : null}

              {!lazadaReadOnly && historyOpen[channel.channel_id] ? <section className="grid gap-3" aria-label={`Lịch sử đăng ${channel.channel_name}`}>
                <h4 className="font-body text-sm font-semibold text-on-surface">Lịch sử thao tác</h4>
                {!history ? <p className="text-body-sm text-graphite">Đang tải lịch sử…</p> : history.requests.length === 0 ? <p className="rounded-lg bg-surface-container-low p-3 text-body-sm text-graphite">Chưa có thao tác nào.</p> : null}
                {history?.requests.map((request) => <article key={request.id} className="grid gap-2 rounded-lg border border-outline-variant/50 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="font-body text-body-sm text-on-surface">{operationLabels[request.operation as PublicationActionInput['operation']] ?? 'Thao tác sản phẩm'}</strong>
                      <StatusBadge tone={tone(request.state)}>{requestStateLabels[request.state] ?? 'Đang cập nhật'}</StatusBadge>
                    </div>
                    <p className="mt-1 text-caption text-graphite">{formattedTime(request.created_at)} · {request.attempt_count} lần thử</p>
                    {request.issues.map((issue, index) => <p key={`${issue.code}-${index}`} className="mt-1 text-caption leading-5 text-error">{publicationIssueMessage(issue)}</p>)}
                    {request.last_error_code ? <p className="mt-1 text-caption leading-5 text-error">{publicationFailureMessage(request.last_error_code)} <code className="break-all font-mono">Mã lỗi: {request.last_error_code}</code></p> : null}
                  </div>
                  {canWrite && request.operation === 'draft' && ['sync_failed', 'blocked'].includes(request.state) ? <Button size="sm" variant="secondary" disabled={isBusy} onClick={() => setConfirmation({ kind: 'retry', channel, requestId: request.id })}>Thử lại</Button> : null}
                </article>)}
              </section> : null}
            </article>
          );
        })}
      </div>
      <Modal open={Boolean(confirmation)} onClose={() => { if (!busyChannel) setConfirmation(null); }} title={confirmation ? confirmationTitle(confirmation) : 'Xác nhận thao tác'} description={confirmation?.kind === 'retry' ? 'Yêu cầu sẽ được gửi lại qua connector hiện có và kết quả sẽ được đọc lại trước khi xác nhận.' : undefined} footer={<><Button variant="ghost" disabled={Boolean(busyChannel)} onClick={() => setConfirmation(null)}>Quay lại</Button><Button loading={Boolean(busyChannel)} variant={confirmation?.kind === 'action' && confirmation.operation === 'unpublish' ? 'danger' : 'primary'} onClick={() => void confirmPendingAction()}>Xác nhận</Button></>}>
        <p className="text-sm leading-6 text-graphite">{confirmation?.kind === 'retry' ? 'Gửi lại yêu cầu tạo bản nháp lỗi. OctoFlow sẽ không đánh dấu hoàn tất cho tới khi đọc lại được trạng thái từ kênh.' : confirmation ? confirmationMessage(confirmation.operation) : ''}</p>
      </Modal>
    </section>
  );
}

function confirmationTitle(confirmation: PublicationConfirmation) {
  if (confirmation.kind === 'retry') return 'Thử lại yêu cầu tạo bản nháp?';
  const labels: Record<PublicationActionInput['operation'], string> = {
    draft: 'Tạo bản nháp?', publish: 'Đăng bán sản phẩm?', unpublish: 'Ngừng bán sản phẩm?',
    catalog_sync: 'Cập nhật thông tin sản phẩm?', price_sync: 'Cập nhật giá bán?',
    inventory_sync: 'Cập nhật lượng hàng có thể bán?', inventory_activate: 'Bật quản lý tồn kho?',
  };
  return labels[confirmation.operation];
}

function confirmationMessage(operation: PublicationActionInput['operation']) {
  const messages: Record<PublicationActionInput['operation'], string> = {
    draft: 'Sản phẩm sẽ được tạo trên kênh ở trạng thái bản nháp. Khách hàng chưa thể mua sản phẩm này.',
    publish: 'OctoFlow sẽ tự chuẩn bị theo dõi tồn kho, xác minh Shopify rồi mở bán. Sau đó hệ thống tự tính hạn mức từ Core ATS và đồng bộ tồn; bạn chỉ cần xử lý khi có cảnh báo chênh lệch hoặc lỗi.',
    unpublish: 'Sản phẩm sẽ ngừng được bán trên kênh. Thông tin sản phẩm và tồn kho trong OctoFlow vẫn được giữ nguyên.',
    catalog_sync: 'OctoFlow sẽ gửi lại thông tin sản phẩm. Nếu sản phẩm đã bị xóa trên Shopify, một bản nháp mới sẽ được tạo và mã SKU sẽ được xác minh lại. Tồn kho Core không đổi.',
    price_sync: 'Giá bán hiện tại sẽ được cập nhật trên kênh sau khi xác nhận.',
    inventory_sync: 'Lượng hàng theo chính sách phân bổ hiện tại sẽ được cập nhật. Tồn trong OctoFlow không thay đổi.',
    inventory_activate: 'Bật theo dõi số lượng cho sản phẩm trên kênh. Số lượng ban đầu theo connector là 0.',
  };
  return messages[operation];
}
