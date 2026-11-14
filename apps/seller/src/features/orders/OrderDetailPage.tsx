import { useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/ScreenState';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Modal } from '../../components/ui/Modal';
import { Tabs } from '../../components/ui/Tabs';
import {
  confirmOrderPayment,
  confirmWooOrderPayment,
  getOrder as getOrderFromApi,
  transitionOrder,
  type Order as ApiOrder,
} from '../../api/orders';
import { getOrder, type DemoMode } from '../../mocks/mock-api';
import { useRealtimeRefresh } from '../realtime/RealtimeProvider';
import { useApiPage } from '../shared/useApiPage';
import { ApiRequestError } from '../../core/api-error';
import { getShopifyFulfillmentStatus, type ShopifyFulfillmentView } from '../../api/shopify';
import { useAuth } from '../auth/AuthProvider';
import { OrderDetailPanel } from './components/OrderDetailPanel';
import { OrderDetailHeader } from './components/OrderDetailHeader';
import { OrderOverviewTab } from './components/OrderOverviewTab';
import { OrderAuditTab } from './components/OrderAuditTab';
import { OrderReturnsTab } from './components/OrderReturnsTab';
import { OrderPrintDocuments, type OrderPrintKind } from './components/OrderPrintDocuments';
import { toOrderApiRow, type ApiOrderTransitionTarget } from './order.api';
import type { Order } from './order.types';

type DetailTab = 'overview' | 'audit' | 'returns';

const DETAIL_TABS = [
  {
    value: 'overview' as const,
    label: (
      <span className="flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
          dashboard
        </span>
        <span>Tổng quan</span>
      </span>
    ),
  },
  {
    value: 'audit' as const,
    label: (
      <span className="flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
          history_edu
        </span>
        <span>Lịch sử & đối soát</span>
      </span>
    ),
  },
  {
    value: 'returns' as const,
    label: (
      <span className="flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
          assignment_return
        </span>
        <span>Trả hàng & hoàn tiền</span>
      </span>
    ),
  },
];

export function OrderDetailPage({ id, mode }: { id: string; mode: DemoMode }) {
  const auth = useAuth();
  const loadFixture = useMemo(() => getOrder, []);
  const page = useApiPage<ReturnType<typeof toOrderApiRow>, Order>(
    async (_cursor, signal) => {
      const order: ApiOrder = await getOrderFromApi(id, signal);
      return { items: [toOrderApiRow(order)], nextCursor: null };
    },
    (currentMode) => loadFixture(id, currentMode).then((order) => (order ? [order] : [])),
    mode,
  );

  useRealtimeRefresh(['orders'], page.revalidate, {
    match: (change) => !change.orderId || change.orderId === id,
    pollWhileDegradedMs: 15_000,
  });

  const isApi = page.source === 'api';
  const row = isApi ? (page.rows[0] as ReturnType<typeof toOrderApiRow> | undefined) : undefined;
  const fixtureOrder = isApi ? undefined : (page.rows[0] as Order | undefined);
  const canPrintPacking = Boolean(row && row.items.length > 0 && ['confirmed', 'packed', 'shipped', 'delivered'].includes(row.status));

  // Tab & Action States
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [busy, setBusy] = useState(false);
  const [transitionError, setTransitionError] = useState<unknown>(null);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [handoverLoading, setHandoverLoading] = useState(false);
  const [handoverView, setHandoverView] = useState<ShopifyFulfillmentView | null>(null);
  const [handoverError, setHandoverError] = useState('');
  const transitionKeys = useRef(new Map<string, string>());

  const transitionKeyFor = (target: ApiOrderTransitionTarget, reason = '') => {
    const signature = `${id}:${target}:${reason.trim()}`;
    const existing = transitionKeys.current.get(signature);
    if (existing) return existing;
    const randomPart = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}`;
    const next = `order-step-${id}-${target}-${randomPart}`;
    transitionKeys.current.set(signature, next);
    return next;
  };

  // Cancellation Modal States
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonError, setCancelReasonError] = useState('');

  // Payment Confirmation Modal States
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [printKind, setPrintKind] = useState<OrderPrintKind | null>(null);
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentTransactionReference, setPaymentTransactionReference] = useState('');
  const [paymentReceivedChecked, setPaymentReceivedChecked] = useState(false);
  const wooPaymentKey = useRef<string | null>(null);

  // Primary Lifecycle Transition
  const handleNextAction = async (target: ApiOrderTransitionTarget) => {
    if (!row) return;
    if (target === 'shipped' && row.channelCode === 'shopify') {
      setHandoverOpen(true);
      setHandoverLoading(true);
      setHandoverError('');
      setHandoverView(null);
      try {
        setHandoverView(await getShopifyFulfillmentStatus(row.id));
      } catch (cause) {
        setHandoverError(cause instanceof Error ? cause.message : 'Không thể kiểm tra điều kiện Shopify.');
      } finally {
        setHandoverLoading(false);
      }
      return;
    }
    setBusy(true);
    setTransitionError(null);
    try {
      const idempotencyKey = transitionKeyFor(target);
      await transitionOrder(row.id, { status: target }, idempotencyKey);
      transitionKeys.current.delete(`${id}:${target}:`);
      await page.revalidate();
      page.refresh();
    } catch (error) {
      setTransitionError(error instanceof ApiRequestError ? error : new Error((error as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const confirmShopifyHandover = async () => {
    const canRecoverExisting = handoverView?.fulfillment_recovery_eligible === true;
    if (!row || (!handoverView?.handover_eligible && !canRecoverExisting) || busy) return;
    setBusy(true);
    setHandoverError('');
    try {
      if (row.status === 'packed') {
        await transitionOrder(row.id, { status: 'shipped' }, transitionKeyFor('shipped'));
      }
      transitionKeys.current.delete(`${id}:shipped:`);
      setHandoverOpen(false);
      await page.revalidate();
      page.refresh();
    } catch (cause) {
      setHandoverError(cause instanceof Error ? cause.message : 'Không thể bàn giao đơn tại OctoFlow.');
    } finally {
      setBusy(false);
    }
  };

  // Confirm Cancellation
  const handleConfirmCancel = async () => {
    if (!row) return;
    const trimmed = cancelReason.trim();
    if (!trimmed) {
      setCancelReasonError('Vui lòng nhập lý do hủy đơn (bắt buộc).');
      return;
    }
    if (trimmed.length > 500) {
      setCancelReasonError('Lý do hủy không được vượt quá 500 ký tự.');
      return;
    }

    setBusy(true);
    setCancelReasonError('');
    setTransitionError(null);
    try {
      const idempotencyKey = transitionKeyFor('cancelled', trimmed);
      await transitionOrder(row.id, { status: 'cancelled', reason: trimmed }, idempotencyKey);
      transitionKeys.current.delete(`${id}:cancelled:${trimmed}`);
      setCancelModalOpen(false);
      setCancelReason('');
      await page.revalidate();
      page.refresh();
    } catch (error) {
      setTransitionError(error instanceof ApiRequestError ? error : new Error((error as Error).message));
    } finally {
      setBusy(false);
    }
  };

  // Confirm Manual Payment
  const handleConfirmPayment = async () => {
    if (!row) return;
    const isWooCommerce = row.channelCode === 'woocommerce';
    if (isWooCommerce && (!paymentTransactionReference.trim() || !paymentReceivedChecked)) return;
    setBusy(true);
    setTransitionError(null);
    try {
      if (isWooCommerce) {
        const randomPart = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`;
        const idempotencyKey = wooPaymentKey.current ?? `woo-payment-${row.id}-${randomPart}`;
        wooPaymentKey.current = idempotencyKey;
        await confirmWooOrderPayment(row.id, {
          transaction_reference: paymentTransactionReference.trim(),
          note: paymentNote.trim(),
        }, idempotencyKey);
        wooPaymentKey.current = null;
      } else {
        const idempotencyKey = `payment-manual-${row.id}-${Date.now()}`;
        await confirmOrderPayment(row.id, paymentNote.trim(), idempotencyKey);
      }
      setPaymentModalOpen(false);
      setPaymentNote('');
      setPaymentTransactionReference('');
      setPaymentReceivedChecked(false);
      await page.revalidate();
      page.refresh();
    } catch (error) {
      setTransitionError(error instanceof ApiRequestError ? error : new Error((error as Error).message));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!printKind) return;
    const clearPrintMode = () => setPrintKind(null);
    window.addEventListener('afterprint', clearPrintMode, { once: true });
    const frame = window.requestAnimationFrame(() => window.print());
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', clearPrintMode);
    };
  }, [printKind]);

  return (
    <section className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 py-6 sm:py-8">
      {/* Screen Loading / Error / Empty States */}
      {page.loading ? <LoadingState label="Đang tải dữ liệu chi tiết đơn hàng…" /> : null}
      {!page.loading && page.fixtureError ? <ErrorState error={page.fixtureError} retry={page.refresh} /> : null}
      {!page.loading && !page.fixtureError && !isApi && !fixtureOrder ? (
        <EmptyState title="Không tìm thấy đơn" detail="Không có đơn này trong dữ liệu mẫu." />
      ) : null}
      {!page.loading && !page.fixtureError && isApi && !row ? (
        <EmptyState title="Không tìm thấy đơn" detail="Không có đơn hàng với mã này. Kiểm tra lại đường dẫn." />
      ) : null}

      {/* Live API Order View */}
      {row ? (
        <>
          {/* A. Header: Most Critical Order Information & Primary Actions */}
          <OrderDetailHeader
            order={row}
            onNextAction={handleNextAction}
            onOpenCancelModal={() => {
              setCancelReason('');
              setCancelReasonError('');
              setCancelModalOpen(true);
            }}
            onPrintSale={() => setPrintKind('sale')}
            onPrintPacking={() => { if (canPrintPacking) setPrintKind('packing'); }}
            canPrintPacking={canPrintPacking}
            busy={busy}
          />
          <OrderPrintDocuments order={row} kind={printKind} />

          {/* Dismissible Inline Transition Error Banner (Does not hide the whole page) */}
          {transitionError ? (
            <div
              role="alert"
              className="flex items-start justify-between gap-3 rounded-control border border-danger/40 bg-danger/10 p-4 text-on-surface"
            >
              <div className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-[20px] text-danger shrink-0 mt-0.5" aria-hidden="true">
                  error
                </span>
                <div className="font-body text-caption">
                  <strong className="block text-body-sm font-semibold text-danger">Thao tác chưa hoàn tất</strong>
                  <p className="mt-0.5 text-on-surface">
                    {transitionError instanceof ApiRequestError
                      ? transitionError.message
                      : transitionError instanceof Error
                      ? transitionError.message
                      : 'Đã xảy ra lỗi trong quá trình xử lý đơn hàng.'}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setTransitionError(null)}>
                Đóng
              </Button>
            </div>
          ) : null}

          {/* C. 3 Business Tabs: Tổng quan, Lịch sử & đối soát, Trả hàng & hoàn tiền */}
          <div className="no-print">
            <Tabs
              ariaLabel="Các phân hệ chi tiết đơn hàng"
              items={DETAIL_TABS}
              value={activeTab}
              onValueChange={(val) => setActiveTab(val)}
              idPrefix="order-detail"
            />
          </div>

          {/* Tab Content Display */}
          <div className="pt-1">
            {activeTab === 'overview' ? (
              <OrderOverviewTab
                order={row}
                onNextAction={handleNextAction}
                onOpenCancelModal={() => {
                  setCancelReason('');
                  setCancelReasonError('');
                  setCancelModalOpen(true);
                }}
                onOpenPaymentModal={() => {
                  setTransitionError(null);
                  setPaymentNote('');
                  setPaymentTransactionReference('');
                  setPaymentReceivedChecked(false);
                  wooPaymentKey.current = null;
                  setPaymentModalOpen(true);
                }}
                onShopifyUpdated={() => { page.revalidate(); page.refresh(); }}
                busy={busy}
              />
            ) : null}

            {activeTab === 'audit' ? (
              <OrderAuditTab order={row} />
            ) : null}

            {activeTab === 'returns' ? (
              <OrderReturnsTab order={row} />
            ) : null}
          </div>

          <Modal
            open={handoverOpen}
            onClose={() => { if (!busy) setHandoverOpen(false); }}
            title="Xác nhận bàn giao vận chuyển Shopify"
            description={handoverView?.fulfillment_recovery_eligible
              ? 'Shopify đã xác nhận fulfillment hoàn tất. Bước này chuyển đơn OctoFlow sang Đang giao và tự động đối soát fulfillment hiện có.'
              : 'Bước này chuyển đơn OctoFlow sang Đang giao và tự động gửi fulfillment lên Shopify. Thông tin hãng vận chuyển và mã vận đơn có thể bổ sung sau.'}
            footer={<div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => setHandoverOpen(false)}>Quay lại</Button>
              <Button size="sm" loading={busy} disabled={busy || handoverLoading || (!handoverView?.handover_eligible && !handoverView?.fulfillment_recovery_eligible) || auth?.user?.role !== 'ADMIN'} onClick={() => void confirmShopifyHandover()}>
                {handoverView?.fulfillment_recovery_eligible ? 'Đối soát fulfillment đã có' : 'Xác nhận và gửi Shopify'}
              </Button>
            </div>}
          >
            <div className="grid gap-3 text-sm text-on-surface">
              <p>Đơn <strong>{row.reference}</strong> · Shopify fulfillment: <strong>{handoverView?.shopify_fulfillment_status || 'đang kiểm tra'}</strong></p>
              <ul className="rounded-control bg-surface-container-low p-3">
                {row.items.map((item) => <li key={item.variantId}>{item.name} ({item.sku}) × {item.quantity}</li>)}
              </ul>
              {handoverLoading ? <LoadingState label="Đang xác minh đơn, location, dòng hàng và quyền Shopify…" /> : null}
              {handoverView?.fulfillment_order_ids?.length ? <p className="break-all text-xs text-graphite">FulfillmentOrder: {handoverView.fulfillment_order_ids.join(', ')}</p> : null}
              {handoverView?.fulfillment_recovery_eligible ? <p role="status" className="rounded-control bg-success/10 p-3 text-success">Shopify đã xác minh đủ dòng hàng ở đúng location. Xác nhận để ghi nhận fulfillment hiện có vào OctoFlow; hệ thống không gửi thêm fulfillment.</p> : null}
              {handoverView && !handoverView.handover_eligible && !handoverView.fulfillment_recovery_eligible ? <p role="alert" className="text-danger">{handoverView.handover_blocked_reason === 'SHOPIFY_ORDER_ALREADY_FULFILLED'
                ? 'Shopify báo đơn đã fulfillment nhưng OctoFlow chưa thể xác minh đầy đủ dòng hàng và location để đối soát an toàn.'
                : `Chưa thể bàn giao lên Shopify: ${handoverView.handover_blocked_reason || handoverView.remote_read_error || 'không đủ điều kiện'}. Kiểm tra kết nối, quyền, location và dòng hàng.`}</p> : null}
              {handoverError ? <p role="alert" className="text-danger">{handoverError}</p> : null}
              <p className="rounded-control bg-surface-container-low p-3 text-graphite">Không cần nhập hãng vận chuyển hoặc mã vận đơn để bàn giao. Có thể cập nhật thông tin này sau trong Shopify.</p>
              <p className="text-xs text-graphite">Sau khi xác nhận, hệ thống tự gửi và đọc lại Shopify. Nếu kết nối gián đoạn, yêu cầu sẽ được thử lại; trạng thái đồng bộ hiển thị trong phần Shopify fulfillment.</p>
            </div>
          </Modal>

          {/* Modal 1: Dedicated Cancellation Modal with ATS Inventory Warning */}
          <Modal
            open={cancelModalOpen}
            onClose={() => {
              if (!busy) {
                setCancelModalOpen(false);
                setCancelReasonError('');
              }
            }}
            title={`Xác nhận hủy đơn hàng ${row.reference}`}
            description="Thao tác hủy đơn sẽ hoàn trả số lượng hàng về kho khả dụng và không thể hoàn tác."
            footer={
              <div className="flex flex-wrap justify-end gap-2.5">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setCancelModalOpen(false);
                    setCancelReasonError('');
                  }}
                >
                  Quay lại
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  loading={busy}
                  disabled={busy || cancelReason.trim().length === 0}
                  onClick={handleConfirmCancel}
                >
                  Xác nhận hủy đơn
                </Button>
              </div>
            }
          >
            <div className="grid gap-4">
              {/* ATS Restock Warning */}
              <div className="flex items-start gap-3 rounded-control border border-warning/40 bg-warning/10 p-3.5 text-on-surface">
                <span className="material-symbols-outlined text-[20px] text-warning" aria-hidden="true">
                  warning
                </span>
                <div className="font-body text-caption leading-relaxed">
                  <strong className="block font-semibold text-warning">
                    Cảnh báo tác động tồn kho (ATS):
                  </strong>
                  <p className="mt-0.5">
                    Toàn bộ <strong>{row.itemCount} sản phẩm</strong> ({row.items.length} mặt hàng) đã giữ chỗ sẽ được tự động <strong>HOÀN TRẢ LẠI TỒN KHO KHẢ DỤNG (ATS)</strong>.
                  </p>
                  <p className="mt-1 text-graphite">
                    Thao tác này sẽ ghi nhận lý do vào nhật ký kiểm toán và kích hoạt đồng bộ tồn kho tới các kênh bán đã kết nối.
                  </p>
                </div>
              </div>

              {/* Reason Input */}
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor={`cancel-reason-input-${row.id}`}
                    className="font-body text-caption font-semibold text-on-surface"
                  >
                    Lý do hủy đơn <span className="text-danger">*</span>
                  </label>
                  <span className="font-mono text-[11px] text-graphite">
                    {cancelReason.length}/500
                  </span>
                </div>
                <textarea
                  id={`cancel-reason-input-${row.id}`}
                  className="min-h-24 w-full rounded-control border border-outline-variant bg-pure-white p-3 font-body text-sm text-on-surface outline-none focus:border-channel-accent focus:ring-1 focus:ring-channel-accent"
                  value={cancelReason}
                  onChange={(e) => {
                    setCancelReason(e.target.value);
                    if (cancelReasonError && e.target.value.trim().length > 0) {
                      setCancelReasonError('');
                    }
                  }}
                  placeholder="Nhập lý do chi tiết: Khách yêu cầu hủy, hết hàng tại kho, sai lệch thông tin địa chỉ..."
                  maxLength={500}
                  disabled={busy}
                />
                {cancelReasonError ? (
                  <span className="font-body text-caption text-danger">{cancelReasonError}</span>
                ) : null}
              </div>
            </div>
          </Modal>

          {/* Modal 2: Manual Payment Confirmation Modal */}
          <Modal
            open={paymentModalOpen}
            onClose={() => {
              if (!busy) {
                setPaymentModalOpen(false);
                wooPaymentKey.current = null;
              }
            }}
            title={row.channelCode === 'woocommerce' ? 'Ghi nhận WooCommerce đã nhận tiền' : 'Xác nhận thanh toán thủ công'}
            description={row.channelCode === 'woocommerce'
              ? 'Xác nhận khi đã ghi nhận khoản thanh toán của đơn, bao gồm giao dịch mô phỏng. OctoFlow lưu người xác nhận và mã tham chiếu, sau đó cập nhật WooCommerce sang Processing mà không đổi tiến trình đơn.'
              : 'Xác nhận thủ công của nhân viên sau khi đã nhận tiền. Thao tác này không xác minh ngân hàng hoặc cổng thanh toán và không thay đổi trạng thái giao hàng.'}
            footer={
              <div className="flex flex-wrap justify-end gap-2.5">
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => setPaymentModalOpen(false)}>
                  Quay lại
                </Button>
                <Button variant="primary" size="sm" loading={busy}
                  disabled={busy || (row.channelCode === 'woocommerce' && (!paymentTransactionReference.trim() || !paymentReceivedChecked))}
                  onClick={handleConfirmPayment}>
                  {row.channelCode === 'woocommerce' ? 'Xác nhận đã nhận tiền' : 'Xác nhận đã thu tiền'}
                </Button>
              </div>
            }
          >
            <div className="grid gap-3">
              {transitionError ? <p role="alert" aria-live="polite" className="rounded-control border border-danger/40 bg-danger/10 p-3 font-body text-caption text-danger">
                {transitionError instanceof Error ? transitionError.message : 'Không thể xác nhận khoản thanh toán.'}
              </p> : null}
              <div className="rounded-control bg-surface-container-low p-3 font-body text-caption text-graphite">
                {row.channelCode === 'woocommerce' ? 'Tổng đơn WooCommerce cần đối chiếu: ' : 'Tổng đơn Core để đối chiếu: '}
                <strong className="font-display text-base font-bold text-channel-accent">{row.channelCode === 'woocommerce'
                  ? `${row.externalSnapshot?.marketplace_total ?? 'Chưa có tổng nguồn'} ${row.externalSnapshot?.currency ?? row.currency}`
                  : row.totalFormatted}</strong>
              </div>
              {row.channelCode === 'woocommerce' ? <>
                <label htmlFor={`woo-transaction-reference-${row.id}`} className="grid gap-1.5 font-body text-caption font-semibold text-on-surface">
                  Mã giao dịch / tham chiếu <span className="text-danger">*</span>
                  <input
                    id={`woo-transaction-reference-${row.id}`}
                    value={paymentTransactionReference}
                    onChange={(event) => { setPaymentTransactionReference(event.target.value); wooPaymentKey.current = null; }}
                    maxLength={128}
                    required
                    disabled={busy}
                    className="rounded-control border border-outline-variant bg-pure-white px-3 py-2.5 text-sm font-normal text-on-surface outline-none focus:border-channel-accent focus:ring-1 focus:ring-channel-accent"
                    placeholder="Nhập mã giao dịch hoặc mã mô phỏng"
                  />
                </label>
                <Checkbox
                  checked={paymentReceivedChecked}
                  disabled={busy}
                  onChange={(event) => { setPaymentReceivedChecked(event.target.checked); wooPaymentKey.current = null; }}
                  label="Tôi xác nhận đã ghi nhận đủ tiền cho đơn hàng này"
                />
              </> : null}
              <label className="grid gap-1.5 font-body text-caption font-semibold text-on-surface">
                Ghi chú thanh toán (tùy chọn)
                <textarea
                  maxLength={500}
                  value={paymentNote}
                  onChange={(e) => { setPaymentNote(e.target.value); wooPaymentKey.current = null; }}
                  disabled={busy}
                  rows={3}
                  className="rounded-control border border-outline-variant bg-pure-white p-3 text-sm font-normal text-on-surface outline-none focus:border-channel-accent focus:ring-1 focus:ring-channel-accent"
                  placeholder="Ví dụ: Đã nhận tiền mặt tại quầy / Chuyển khoản Vietcombank mã GD..."
                />
              </label>
            </div>
          </Modal>
        </>
      ) : null}

      {/* Demo / Mock Fixture View (Strictly separated from Live API) */}
      {fixtureOrder ? <OrderDetailPanel order={fixtureOrder} showAudit /> : null}
    </section>
  );
}
