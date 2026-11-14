import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiRequestError } from '../../core/api-error';
import { href, navigate } from '../../app/routes';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/ScreenState';
import { getInventoryRowBySku, listInventory } from '../../api/inventory';
import { getPosFixture, type DemoMode } from '../../mocks/mock-api';
import { useRealtimeRefresh } from '../realtime/RealtimeProvider';
import { useApiPage } from '../shared/useApiPage';
import type { CartItem, PosProductFixture, PosSale, PosSimMode, SalePaymentInstruction, SalePaymentMethod } from './pos.types';
import { cartTotalMinor, parseMoneyInput, reviewCartAvailability, toPosProducts, type CartReview } from './pos.api';
import { useSaleAttempt } from './useSaleAttempt';
import { CurrentSalePanel } from './components/CurrentSalePanel';
import { POSHeader, type POSRuntimeStatus } from './components/POSHeader';
import { ProductCatalogPanel } from './components/ProductCatalogPanel';
import { SimulatorSwitcher } from './components/SimulatorSwitcher';

function minorToInput(amount: number, currency: string): string {
  let fractionDigits: number;
  try {
    fractionDigits = new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 0;
  } catch {
    return '';
  }
  const scale = 10n ** BigInt(fractionDigits);
  const value = BigInt(amount);
  const whole = value / scale;
  const fraction = value % scale;
  return fractionDigits === 0 ? whole.toString() : `${whole}.${fraction.toString().padStart(fractionDigits, '0')}`;
}

function makePaymentInstruction(
  method: SalePaymentMethod,
  totalMinor: number | null,
  currency: string,
  cashReceivedMinor: number | null,
  externalVerified: boolean,
): SalePaymentInstruction | null {
  if (totalMinor === null || !currency) return null;
  if (method === 'external') {
    if (!externalVerified) return null;
    return {
      method,
      receivedMinor: totalMinor,
      changeMinor: 0,
      note: `POS external payment manually verified; amount_minor=${totalMinor}; currency=${currency}.`,
    };
  }
  if (cashReceivedMinor === null || cashReceivedMinor < totalMinor) return null;
  const changeMinor = cashReceivedMinor - totalMinor;
  return {
    method,
    receivedMinor: cashReceivedMinor,
    changeMinor,
    note: `POS cash received; received_minor=${cashReceivedMinor}; change_minor=${changeMinor}; currency=${currency}.`,
  };
}

export function POSPage({ mode, userId, canDiscount = false, canManageAllocation = false }: { mode: DemoMode; userId: string; canDiscount?: boolean; canManageAllocation?: boolean }) {
  const [search, setSearch] = useState('');
  const [serverSearch, setServerSearch] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setServerSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadFixture = useMemo(() => async (demoMode: DemoMode) => (await getPosFixture(demoMode))?.products ?? [], []);
  const page = useApiPage<PosProductFixture>(
    async (cursor, signal) => {
      const response = await listInventory({ limit: 100, ...(cursor === null ? {} : { cursor }), ...(serverSearch ? { q: serverSearch } : {}) }, signal);
      return { items: toPosProducts(response.items), nextCursor: response.nextCursor };
    },
    loadFixture,
    mode,
    100,
    { requestKey: serverSearch, getRowKey: (product) => product.id, pendingUntilResolved: true },
  );
  useRealtimeRefresh(['inventory'], page.revalidate, { pollWhileDegradedMs: 15_000 });

  const [simMode, setSimMode] = useState<PosSimMode>('normal');
  const attempt = useSaleAttempt(userId);
  const [cart, setCart] = useState<CartItem[]>(() => attempt.pendingCart ?? []);
  const [sale, setSale] = useState<PosSale | null>(null);
  const [saleError, setSaleError] = useState<unknown>(null);
  const [cartError, setCartError] = useState<string | null>(null);
  const [stockReview, setStockReview] = useState<CartReview | null>(null);
  const [stockChecking, setStockChecking] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>(() => attempt.payment?.method ?? 'cash');
  const [cashReceived, setCashReceived] = useState(() => attempt.payment?.method === 'cash' ? minorToInput(attempt.payment.receivedMinor, cart[0]?.currency ?? 'VND') : '');
  const [externalVerified, setExternalVerified] = useState(() => attempt.payment?.method === 'external');
  const [discountInput, setDiscountInput] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [mobilePane, setMobilePane] = useState<'catalog' | 'cart'>('catalog');
  const confirmLock = useRef(false);
  const checkoutRef = useRef<HTMLDivElement>(null);
  const scrollToCheckoutAfterAdd = useRef(false);

  useEffect(() => {
    if (!scrollToCheckoutAfterAdd.current) return;
    scrollToCheckoutAfterAdd.current = false;
    const target = checkoutRef.current;
    if (!target || typeof target.scrollIntoView !== 'function') return;
    const frame = window.requestAnimationFrame(() => target.scrollIntoView({ behavior: 'smooth', block: 'end' }));
    return () => window.cancelAnimationFrame(frame);
  }, [cart]);

  useEffect(() => {
    if (attempt.pendingCart) setCart(attempt.pendingCart);
    else if (attempt.status === 'blocked') setCart([]);
  }, [attempt.pendingCart, attempt.status]);

  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const source = page.source;
  const products = page.rows;
  const canSell = source === 'api' && online;
  const runtimeStatus: POSRuntimeStatus = !online
    ? 'offline'
    : page.loading || source === 'pending'
      ? 'checking'
      : source === 'api'
        ? 'connected'
        : 'demo';

  const cartLocked = ['submitting', 'indeterminate', 'payment-pending', 'payment-indeterminate', 'blocked'].includes(attempt.status);
  const cartCurrencies = new Set(cart.map((item) => item.currency));
  const mixedCurrency = cartCurrencies.size > 1;
  const currency = cartCurrencies.size === 1 ? [...cartCurrencies][0]! : '';
  const subtotalMinor = cartTotalMinor(cart);
  const parsedDiscount = discountInput.trim() === '' ? 0 : (currency ? parseMoneyInput(discountInput, currency) : null);
  const discountMinor = !canDiscount ? 0 : parsedDiscount !== null && subtotalMinor !== null && parsedDiscount <= subtotalMinor ? parsedDiscount : null;
  const discountReady = discountMinor !== null && (discountMinor === 0 || discountReason.trim().length > 0);
  const totalMinor = subtotalMinor === null || discountMinor === null ? null : subtotalMinor - discountMinor;
  const receivedMinor = paymentMethod === 'cash' && currency ? parseMoneyInput(cashReceived, currency) : null;
  const preparedPayment = makePaymentInstruction(paymentMethod, totalMinor, currency, receivedMinor, externalVerified);
  const paymentInstruction = attempt.payment ?? preparedPayment;
  const paymentReady = paymentInstruction !== null;
  const paymentLocked = Boolean(attempt.payment)
    && ['submitting', 'indeterminate', 'payment-pending', 'payment-indeterminate', 'blocked'].includes(attempt.status);
  const isRecovery = ['indeterminate', 'payment-pending', 'payment-indeterminate'].includes(attempt.status);
  const checkoutEnabled = canSell
    && cart.length > 0
    && totalMinor !== null
    && !mixedCurrency
    && paymentReady
    && discountReady
    && !cartLocked
    && !stockReview
    && !stockChecking;
  const recoveryEnabled = canSell
    && cart.length > 0
    && !attempt.submitting
    && attempt.status !== 'blocked'
    && (attempt.status === 'indeterminate' || paymentReady);

  useEffect(() => {
    if (attempt.payment) {
      setPaymentMethod(attempt.payment.method);
      setCashReceived(attempt.payment.method === 'cash' ? minorToInput(attempt.payment.receivedMinor, currency || cart[0]?.currency || 'VND') : '');
      setExternalVerified(attempt.payment.method === 'external');
    }
  }, [attempt.payment, cart, currency]);

  const readFreshCartSnapshot = useCallback(async (items: readonly CartItem[]): Promise<CartReview | null> => {
    setStockChecking(true);
    setCartError(null);
    try {
      const snapshots = await Promise.all(items.map((item) => getInventoryRowBySku(item.sku)));
      const currentBySku = new Map(items.map((item, index) => [item.sku, snapshots[index]!]));
      const review = reviewCartAvailability(items, currentBySku);
      if (!review) throw new Error('Không đọc được tồn, giá, loại tiền hợp lệ cho toàn bộ giỏ; chưa tạo đơn.');
      page.revalidate();
      return review;
    } catch (error) {
      setCartError(error instanceof Error
        ? `Không thể kiểm tra tồn mới nhất nên chưa tạo đơn: ${error.message}`
        : 'Không thể kiểm tra tồn mới nhất nên chưa tạo đơn. Hãy thử lại khi máy chủ hoạt động.');
      return null;
    } finally {
      setStockChecking(false);
    }
  }, [page.revalidate]);

  const addProduct = (product: PosProductFixture) => {
    if (cartLocked || product.ats <= 0 || product.priceValue === null) return;
    const productCurrency = product.currency ?? 'VND';
    const currentCurrency = cart[0]?.currency;
    if (currentCurrency && currentCurrency !== productCurrency) {
      setCartError(`Không thể thêm ${product.sku}: giỏ đang dùng ${currentCurrency}, sản phẩm này dùng ${productCurrency}. Mỗi giỏ chỉ dùng một loại tiền.`);
      return;
    }
    const existing = cart.find((item) => item.sku === product.sku);
    if (existing && existing.qty >= product.ats) {
      setCartError(`Tồn khả dụng của ${product.sku} đã giảm. Giỏ vẫn giữ ${existing.qty} sản phẩm; hãy kiểm tra lại trước khi bán.`);
      void readFreshCartSnapshot(cart);
      return;
    }
    setCartError(null);
    setSale(null);
    attempt.reset();
    scrollToCheckoutAfterAdd.current = true;
    setMobilePane('cart');
    setCart((current) => {
      const currentLine = current.find((item) => item.sku === product.sku);
      if (currentLine) {
        return current.map((item) => item.sku === product.sku ? { ...item, qty: item.qty + 1, maxQty: product.ats } : item);
      }
      return [...current, {
        sku: product.sku,
        name: product.name,
        variant: product.variant,
        unitPrice: product.priceValue!,
        currency: productCurrency,
        qty: 1,
        maxQty: product.ats,
      }];
    });
  };

  const changeQty = (sku: string, qty: number) => {
    if (cartLocked) return;
    const line = cart.find((item) => item.sku === sku);
    if (!line || !Number.isSafeInteger(qty) || qty <= 0 || qty > line.maxQty) {
      setCartError(`Số lượng ${sku} phải là số nguyên dương trong giới hạn tồn đã chọn.`);
      return;
    }
    setStockReview(null);
    setCartError(null);
    setCart((current) => current.map((item) => item.sku === sku ? { ...item, qty } : item));
  };

  const clearCart = () => {
    if (cartLocked || !attempt.reset()) return;
    setCart([]);
    setSale(null);
    setSaleError(null);
    setCartError(null);
    setStockReview(null);
    setCashReceived('');
    setExternalVerified(false);
  };

  const confirmSale = async () => {
    if (confirmLock.current || !canSell || cart.length === 0 || attempt.submitting || attempt.status === 'blocked') return;
    confirmLock.current = true;
    try {
      if (mixedCurrency) {
        setCartError('Giỏ hàng có nhiều loại tiền. Hãy tách thành các giao dịch riêng trước khi xác nhận.');
        return;
      }
      const pendingRecovery = isRecovery;
      const payment = attempt.payment ?? preparedPayment;
      if (pendingRecovery && attempt.status === 'indeterminate' && !attempt.payment && !payment) {
        const outcome = await attempt.submit(cart, null, discountMinor ?? 0, discountReason);
        await handleOutcome(outcome);
        return;
      }
      if (!discountReady || discountMinor === null) {
        setCartError('Kiểm tra số tiền và lý do giảm giá trước khi xác nhận.');
        return;
      }
      if (!payment) {
        setCartError(paymentMethod === 'cash'
          ? 'Nhập đủ số tiền khách đã đưa trước khi xác nhận.'
          : 'Hãy trực tiếp kiểm chứng khoản thanh toán ngoài hệ thống trước khi xác nhận.');
        return;
      }

      let requestCart = cart;
      if (!pendingRecovery) {
        const review = await readFreshCartSnapshot(cart);
        if (!review) return;
        if (review.changes.length > 0) {
          setStockReview(review);
          setSaleError(null);
          return;
        }
        requestCart = review.proposedCart;
        setCart(requestCart);
      }

      setCartError(null);
      const outcome = await attempt.submit(requestCart, payment, discountMinor, discountReason);
      await handleOutcome(outcome);
    } finally {
      confirmLock.current = false;
    }
  };

  const handleOutcome = async (outcome: Awaited<ReturnType<typeof attempt.submit>>) => {
    if (outcome.kind === 'sold' && outcome.sale) {
      setSale(outcome.sale);
      setSaleError(null);
      setCart([]);
      setStockReview(null);
      setCashReceived('');
      setExternalVerified(false);
      setDiscountInput('');
      setDiscountReason('');
      page.refresh();
      return;
    }
    if (outcome.kind === 'payment-pending') {
      setSale(outcome.sale ?? null);
      setSaleError(outcome.error ?? null);
      if (outcome.requiresPaymentReview) {
        setCashReceived('');
        setExternalVerified(false);
      }
      page.revalidate();
      return;
    }
    setSale(null);
    setSaleError(new Error(posSaleErrorMessage(outcome.error)));
    if (outcome.stockConflict) {
      page.revalidate();
      const review = await readFreshCartSnapshot(cart);
      if (review?.changes.length) setStockReview(review);
      else if (review && !(outcome.error instanceof ApiRequestError)) setCartError('Máy chủ từ chối đơn do tồn kho thay đổi. Số lượng chưa được chỉnh sửa; kiểm tra tồn rồi thử lại.');
    }
  };

  const acceptStockReview = () => {
    if (!stockReview) return;
    setCart(stockReview.proposedCart);
    setStockReview(null);
    setCartError(null);
    setSaleError(null);
    // Cash tender and external verification both belong to the old basket total. Require a
    // fresh cashier confirmation after any server-owned stock, price, or currency change.
    setCashReceived('');
    setExternalVerified(false);
    setDiscountInput('');
    setDiscountReason('');
  };

  const startNextSale = () => {
    if (!attempt.reset()) return;
    setSale(null);
    setSaleError(null);
    setCartError(null);
    setPaymentMethod('cash');
    setCashReceived('');
    setExternalVerified(false);
    setDiscountInput('');
    setDiscountReason('');
    setMobilePane('catalog');
  };

  const resolveConflict = () => {
    if (cartLocked) return;
    setCartError('Mô phỏng xung đột: chưa tự thay đổi số lượng trong giỏ. Hãy mở giỏ và xác nhận mọi điều chỉnh trước khi bán.');
    setStockReview(null);
  };

  const catalogVisible = mobilePane === 'catalog';
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const hasProducts = products.length > 0;

  return (
    <section className="mx-auto flex w-full max-w-[1280px] min-w-0 flex-col gap-6 py-8">
      <POSHeader status={runtimeStatus} />
      {!online ? <div role="alert" className="rounded-card border border-outline-variant/60 bg-error-container p-4 font-body text-body-sm text-on-error-container"><strong className="block font-display text-base">Mất kết nối mạng.</strong>Không tạo đơn mới khi đang ngoại tuyến. Giao dịch đang chờ vẫn giữ nguyên để đối soát sau khi kết nối lại.</div> : null}
      {page.loading ? <LoadingState label="Đang tải danh mục sản phẩm…" /> : null}
      {!page.loading && page.fixtureError ? <ErrorState error={page.fixtureError} retry={page.refresh} /> : null}
      {!page.loading && !page.fixtureError && !hasProducts ? <EmptyState title="Chưa có sản phẩm để bán" detail="Không tìm thấy sản phẩm trong danh mục đã tải." /> : null}
      {!page.loading && !page.fixtureError && hasProducts ? (
        <>
          {canSell ? null : <SimulatorSwitcher mode={simMode} onModeChange={setSimMode} onResolveConflict={resolveConflict} canSell={canSell} />}
          <div className="grid grid-cols-2 gap-2 rounded-control bg-surface-container-low p-1 lg:hidden" aria-label="Chuyển giữa danh mục và giỏ hàng">
            <button type="button" aria-pressed={catalogVisible} aria-controls="pos-catalog" className={`min-h-11 rounded-control px-3 font-body text-body-sm font-semibold ${catalogVisible ? 'bg-pure-white text-on-surface shadow-card' : 'text-graphite'}`} onClick={() => setMobilePane('catalog')}>Danh mục ({products.length})</button>
            <button type="button" aria-pressed={!catalogVisible} aria-controls="pos-cart" className={`min-h-11 rounded-control px-3 font-body text-body-sm font-semibold ${!catalogVisible ? 'bg-pure-white text-on-surface shadow-card' : 'text-graphite'}`} onClick={() => setMobilePane('cart')}>Giỏ hàng ({cartCount})</button>
          </div>
          <div className="grid min-w-0 gap-6 lg:grid-cols-12">
            <div id="pos-catalog" className={`${catalogVisible ? '' : 'hidden lg:block'} min-w-0 lg:col-span-7`}>
              <ProductCatalogPanel
                products={products}
                search={search}
                onSearchChange={setSearch}
                onAdd={addProduct}
                canManageAllocation={canManageAllocation}
                interactionDisabled={cartLocked || !canSell}
                hasMore={page.hasMore}
                loadingMore={page.loadingMore}
                loadMoreError={page.loadingMore ? null : page.error}
                onLoadMore={page.loadMore}
              />
            </div>
            <div id="pos-cart" className={`${catalogVisible ? 'hidden lg:block' : ''} min-w-0 lg:col-span-5`}>
              <CurrentSalePanel
                items={cart}
                currency={currency}
                totalMinor={totalMinor}
                subtotalMinor={subtotalMinor}
                discountMinor={discountMinor}
                discountInput={discountInput}
                discountReason={discountReason}
                canDiscount={canDiscount}
                onDiscountInputChange={(amount) => { setDiscountInput(amount); setCashReceived(''); setExternalVerified(false); setCartError(null); }}
                onDiscountReasonChange={(reason) => { setDiscountReason(reason); setCartError(null); }}
                submitting={attempt.submitting}
                sale={sale}
                saleError={saleError}
                attemptStatus={attempt.status}
                pendingReference={attempt.reference}
                pendingOrderId={attempt.orderId}
                blockedReason={attempt.blockedReason}
                cartLocked={cartLocked}
                paymentLocked={paymentLocked}
                cartError={cartError}
                paymentMethod={paymentMethod}
                onPaymentMethodChange={(method) => { setPaymentMethod(method); setExternalVerified(false); setCartError(null); }}
                cashReceived={cashReceived}
                onCashReceivedChange={(amount) => { setCashReceived(amount); setCartError(null); }}
                cashReceivedMinor={receivedMinor}
                externalVerified={externalVerified}
                onExternalVerifiedChange={setExternalVerified}
                paymentInstruction={attempt.payment}
                checkoutEnabled={checkoutEnabled}
                recoveryEnabled={recoveryEnabled}
                stockReview={stockReview}
                stockChecking={stockChecking}
                onAcceptStockReview={acceptStockReview}
                onConfirm={() => void confirmSale()}
                onOpenOrder={(orderId) => navigate(href({ name: 'order-detail', id: orderId }))}
                onStartNextSale={startNextSale}
                onDismissSaleError={() => setSaleError(null)}
                onQtyChange={changeQty}
                onRemove={(sku) => {
                  if (cartLocked) return;
                  setCartError(null);
                  setStockReview(null);
                  setCart((current) => current.filter((item) => item.sku !== sku));
                }}
                onClear={clearCart}
                checkoutRef={checkoutRef}
              />
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function posSaleErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return 'Máy chủ chưa xác nhận giao dịch. Hãy kiểm tra trạng thái trước khi thử lại.';
  switch (error.code) {
    case 'POS_QUOTA_INSUFFICIENT':
      return 'POS không còn đủ quota cho số lượng này. Tồn POS mới nhất đã được tải; hãy kiểm tra và xác nhận lại giỏ hàng.';
    case 'POS_ALLOCATION_TRANSITIONING':
      return 'SKU đang chuyển quota. POS tạm thời chưa thể bán; hãy đợi kênh online xác minh xong rồi tải lại tồn.';
    case 'POS_ALLOCATION_NOT_READY':
      return 'Quota POS chưa sẵn sàng hoặc trạng thái kênh chưa được xác minh. Hãy tải lại trạng thái phân bổ trước khi bán.';
    case 'INSUFFICIENT_STOCK':
      return 'Kho trung tâm không còn đủ Core ATS cho số lượng này. Giỏ chưa được bán; hãy kiểm tra lại số lượng.';
    case 'STATE_CONFLICT':
      return 'Giá hoặc trạng thái sản phẩm đã thay đổi. Giỏ chưa được bán; hãy kiểm tra lại dữ liệu mới nhất.';
    default:
      return 'Máy chủ từ chối giao dịch. Tải lại tồn và kiểm tra trạng thái mới nhất trước khi thử lại.';
  }
}
