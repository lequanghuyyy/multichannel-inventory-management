import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiRequestError } from '../../core/api-error';
import { confirmOrderPayment, createOrder, getOrder, type CreateOrderInput, type Order } from '../../api/orders';
import type { CartItem, PosSale, SalePaymentInstruction } from './pos.types';
import { cartTotalMinor } from './pos.api';

export interface SaleAttempt {
  key: string;
  reference: string;
}

export type SaleAttemptStatus =
  | 'new'
  | 'submitting'
  | 'indeterminate'
  | 'payment-pending'
  | 'payment-indeterminate'
  | 'confirmed'
  | 'rejected'
  | 'blocked';

export interface SaleOutcome {
  kind: 'sold' | 'payment-pending' | 'failed';
  sale?: PosSale;
  error?: unknown;
  stockConflict?: boolean;
  indeterminate: boolean;
  blocked?: boolean;
  requiresPaymentReview?: boolean;
}

interface PendingSaleV3 {
  version: 3;
  ownerUserId: string;
  createdAt: number;
  updatedAt: number;
  phase: 'creating' | 'awaiting_payment' | 'confirming' | 'blocked';
  attempt: SaleAttempt;
  createRequest: CreateOrderInput;
  cart: CartItem[];
  payment: SalePaymentInstruction | null;
  paymentKey: string | null;
  orderId: string | null;
  orderReference: string | null;
  blockedReason: string | null;
}

interface PendingSaleV2 {
  version: 2;
  ownerUserId: string;
  createdAt: number;
  updatedAt: number;
  phase: 'submitting' | 'indeterminate';
  attempt: SaleAttempt;
  request: CreateOrderInput;
  cart: CartItem[];
}

interface SaleAttemptView {
  status: SaleAttemptStatus;
  pendingCart: CartItem[] | null;
  reference: string | null;
  orderId: string | null;
  payment: SalePaymentInstruction | null;
  blockedReason: string | null;
}

interface InitialState {
  storageKey: string | null;
  record: PendingSaleV3 | null;
  view: SaleAttemptView;
}

const keyPattern = /^[A-Za-z0-9._:-]{1,128}$/;
const referencePattern = /^[A-Za-z0-9._:-]{1,64}$/;
const tillStorageKey = 'datt.pos.till.v2';
const legacyTillStorageKey = 'datt.pos.till.v1';
const pendingStoragePrefix = 'datt.pos.pending-sale.v3';
const legacyPendingStoragePrefix = 'datt.pos.pending-sale.v2';
const oldestPendingStoragePrefix = 'datt.pos.pending-sale.v1';
// The server keeps order/payment replay rows for 30 days. Stop automatic retries before that
// boundary so a local attempt never outlives the backend record that makes replay safe.
const maxPendingAgeMs = 28 * 24 * 60 * 60 * 1000;

function fingerprintDigest(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function entropy(): string {
  return Math.floor(Math.random() * 0x1_0000_0000).toString(36);
}

function mintReference(now: number, nonce: number, random: string): string {
  const date = new Date(now).toISOString().slice(0, 10).replace(/-/g, '');
  return `POS-${date}-${now.toString(36).toUpperCase()}${nonce.toString(36).toUpperCase()}${random.slice(0, 6).toUpperCase()}`.slice(0, 64);
}

function mintAttempt(request: Omit<CreateOrderInput, 'reference'>, now: number, nonce: number): SaleAttempt {
  const random = entropy();
  const identity = JSON.stringify(request);
  const key = `pos-${fingerprintDigest(identity)}-${now.toString(36)}-${nonce.toString(36)}-${random}`;
  return { key: key.slice(0, 128), reference: mintReference(now, nonce, random) };
}

function mintPaymentKey(attempt: SaleAttempt, now: number, nonce: number): string {
  const key = `pos-pay-${fingerprintDigest(`${attempt.reference}:${nonce}`)}-${now.toString(36)}-${entropy()}`;
  return key.slice(0, 128);
}

function cloneCart(items: readonly CartItem[]): CartItem[] {
  return items.map((item) => ({ ...item }));
}

function sameCart(left: readonly CartItem[], right: readonly CartItem[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function samePayment(left: SalePaymentInstruction, right: SalePaymentInstruction): boolean {
  return left.method === right.method
    && left.receivedMinor === right.receivedMinor
    && left.changeMinor === right.changeMinor
    && left.note === right.note;
}

function hasOneCurrency(items: readonly CartItem[]): boolean {
  return items.length > 0 && new Set(items.map((item) => item.currency)).size === 1;
}

function validCartItem(value: unknown): value is CartItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as CartItem;
  return typeof item.sku === 'string' && item.sku.length > 0
    && typeof item.name === 'string'
    && typeof item.variant === 'string'
    && typeof item.currency === 'string' && item.currency.length > 0
    && Number.isSafeInteger(item.unitPrice) && item.unitPrice >= 0
    && Number.isSafeInteger(item.qty) && item.qty > 0
    && Number.isSafeInteger(item.maxQty) && item.maxQty > 0
    && item.qty <= item.maxQty;
}

function validCart(items: readonly CartItem[]): boolean {
  return items.length > 0
    && items.every(validCartItem)
    && new Set(items.map((item) => item.sku)).size === items.length
    && hasOneCurrency(items)
    && cartTotalMinor(items) !== null;
}

function validPayment(value: unknown, total: number): value is SalePaymentInstruction {
  if (typeof value !== 'object' || value === null) return false;
  const payment = value as SalePaymentInstruction;
  const noteLength = typeof payment.note === 'string' ? Array.from(payment.note).length : Number.MAX_SAFE_INTEGER;
  if (payment.method !== 'cash' && payment.method !== 'external') return false;
  if (!Number.isSafeInteger(payment.receivedMinor) || payment.receivedMinor < total) return false;
  if (!Number.isSafeInteger(payment.changeMinor) || payment.changeMinor < 0) return false;
  if (payment.changeMinor !== payment.receivedMinor - total) return false;
  if (payment.method === 'external' && payment.changeMinor !== 0) return false;
  return noteLength > 0 && noteLength <= 500;
}

function validPendingV3(value: unknown): value is PendingSaleV3 {
  if (typeof value !== 'object' || value === null) return false;
  const pending = value as PendingSaleV3;
  if (pending.version !== 3 || typeof pending.ownerUserId !== 'string' || pending.ownerUserId === '') return false;
  if (!Number.isFinite(pending.createdAt) || !Number.isFinite(pending.updatedAt)) return false;
  if (!['creating', 'awaiting_payment', 'confirming', 'blocked'].includes(pending.phase)) return false;
  if (!pending.attempt || !keyPattern.test(pending.attempt.key) || !referencePattern.test(pending.attempt.reference)) return false;
  if (!pending.createRequest || pending.createRequest.reference !== pending.attempt.reference || pending.createRequest.channel_code !== 'pos') return false;
  if (!Array.isArray(pending.createRequest.lines) || !Array.isArray(pending.cart) || pending.createRequest.lines.length !== pending.cart.length) return false;
  if (!pending.cart.every(validCartItem) || !hasOneCurrency(pending.cart)) return false;
  const total = cartTotalMinor(pending.cart);
  if (total === null) return false;
  if (pending.createRequest.lines.some((line, index) => (
    typeof line?.sku !== 'string'
    || !Number.isSafeInteger(line.quantity) || line.quantity <= 0
    || line.sku !== pending.cart[index]?.sku
    || line.quantity !== pending.cart[index]?.qty
  ))) return false;
  if (pending.phase === 'creating') {
    if ((pending.payment === null) !== (pending.paymentKey === null)) return false;
    if (pending.payment && !validPayment(pending.payment, total)) return false;
    return pending.orderId === null && pending.orderReference === null && pending.blockedReason === null;
  }
  if (pending.phase === 'awaiting_payment') {
    return pending.orderId !== null && pending.orderReference !== null && pending.payment === null && pending.paymentKey === null && pending.blockedReason === null;
  }
  if (pending.phase === 'blocked') {
    return pending.orderId !== null && pending.orderReference !== null && pending.payment === null && pending.paymentKey === null
      && typeof pending.blockedReason === 'string' && pending.blockedReason.length > 0;
  }
  return pending.orderId !== null && pending.orderReference !== null
    && pending.payment !== null && keyPattern.test(pending.paymentKey ?? '')
    && validPayment(pending.payment, total) && pending.blockedReason === null;
}

function validPendingV2(value: unknown): value is PendingSaleV2 {
  if (typeof value !== 'object' || value === null) return false;
  const pending = value as PendingSaleV2;
  if (pending.version !== 2 || typeof pending.ownerUserId !== 'string' || pending.ownerUserId === '') return false;
  if (!Number.isFinite(pending.createdAt) || !Number.isFinite(pending.updatedAt)) return false;
  if (pending.phase !== 'submitting' && pending.phase !== 'indeterminate') return false;
  if (!pending.attempt || !keyPattern.test(pending.attempt.key) || !referencePattern.test(pending.attempt.reference)) return false;
  if (!pending.request || pending.request.reference !== pending.attempt.reference || pending.request.channel_code !== 'pos') return false;
  if (!Array.isArray(pending.request.lines) || !Array.isArray(pending.cart) || pending.request.lines.length !== pending.cart.length) return false;
  if (!pending.cart.every(validCartItem) || !hasOneCurrency(pending.cart)) return false;
  return pending.request.lines.every((line, index) => (
    typeof line?.sku === 'string'
    && Number.isSafeInteger(line.quantity) && line.quantity > 0
    && line.sku === pending.cart[index]?.sku
    && line.quantity === pending.cart[index]?.qty
  ));
}

function loadTillId(): string {
  const storage = globalThis.localStorage;
  if (!storage) throw new Error('Thiết bị không cho phép lưu giao dịch bán hàng.');
  const existing = storage.getItem(tillStorageKey);
  if (existing) return existing;

  let id = globalThis.sessionStorage?.getItem(legacyTillStorageKey) ?? '';
  if (!id) {
    const oldPendingKeys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(`${legacyPendingStoragePrefix}:`) || key?.startsWith(`${oldestPendingStoragePrefix}:`)) oldPendingKeys.push(key);
    }
    if (oldPendingKeys.length > 1) throw new Error('Có nhiều giao dịch bán hàng cũ chưa được đối soát. Hãy kiểm tra chúng trước khi bán tiếp.');
    if (oldPendingKeys.length === 1) id = oldPendingKeys[0]!.split(':').at(-1) ?? '';
  }
  if (!id) id = `${Date.now().toString(36)}-${entropy()}`;
  storage.setItem(tillStorageKey, id);
  if (storage.getItem(tillStorageKey) !== id) throw new Error('Không thể lưu phiên bán hàng lâu dài trên thiết bị.');
  return id;
}

function writePending(storageKey: string, pending: PendingSaleV3): void {
  const storage = globalThis.localStorage;
  if (!storage) throw new Error('Thiết bị không cho phép lưu giao dịch đang chờ.');
  const encoded = JSON.stringify(pending);
  storage.setItem(storageKey, encoded);
  if (storage.getItem(storageKey) !== encoded) throw new Error('Không thể kiểm tra giao dịch đang chờ trên thiết bị.');
}

function verifyPending(storageKey: string, pending: PendingSaleV3): void {
  const storage = globalThis.localStorage;
  if (!storage || storage.getItem(storageKey) !== JSON.stringify(pending)) {
    throw new Error('Giao dịch đang chờ không còn nguyên vẹn trên thiết bị.');
  }
}

function removePending(storageKey: string, tillId: string): void {
  const storage = globalThis.localStorage;
  if (!storage) throw new Error('Thiết bị không cho phép lưu giao dịch đang chờ.');
  storage.removeItem(storageKey);
  storage.removeItem(`${legacyPendingStoragePrefix}:${tillId}`);
  storage.removeItem(`${oldestPendingStoragePrefix}:${tillId}`);
  if (storage.getItem(storageKey) !== null) throw new Error('Không thể xoá giao dịch đã hoàn tất khỏi thiết bị.');
}

function stateForRecord(record: PendingSaleV3): SaleAttemptView {
  const status: SaleAttemptStatus = record.phase === 'creating'
    ? 'indeterminate'
    : record.phase === 'awaiting_payment'
      ? 'payment-pending'
      : record.phase === 'blocked'
        ? 'blocked'
        : 'payment-indeterminate';
  return {
    status,
    pendingCart: cloneCart(record.cart),
    reference: record.orderReference ?? record.attempt.reference,
    orderId: record.orderId,
    payment: record.payment,
    blockedReason: record.blockedReason,
  };
}

function blocked(reason: string, record: PendingSaleV3 | null = null, storageKey: string | null = null): InitialState {
  return {
    storageKey,
    record,
    view: {
      status: 'blocked',
      pendingCart: null,
      reference: record?.orderReference ?? record?.attempt.reference ?? null,
      orderId: record?.orderId ?? null,
      payment: record?.payment ?? null,
      blockedReason: reason,
    },
  };
}

function initialize(ownerUserId: string): InitialState {
  if (!ownerUserId) return blocked('Không xác định được tài khoản đang bán hàng.');
  let tillId: string;
  try {
    tillId = loadTillId();
  } catch (error) {
    return blocked(error instanceof Error ? error.message : 'Không thể chuẩn bị lưu giao dịch bán hàng.');
  }
  const storageKey = `${pendingStoragePrefix}:${tillId}`;
  try {
    const storage = globalThis.localStorage;
    if (!storage) return blocked('Thiết bị không cho phép lưu giao dịch đang chờ.', null, storageKey);
    if (storage.getItem(`${oldestPendingStoragePrefix}:${tillId}`) !== null) {
      return blocked('Có giao dịch đang chờ từ phiên bản cũ nhưng thiếu thông tin để gửi lại an toàn. Hãy kiểm tra đơn theo mã tham chiếu trước khi tiếp tục.', null, storageKey);
    }

    const raw = storage.getItem(storageKey);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (!validPendingV3(parsed)) return blocked('Dữ liệu giao dịch đang chờ bị hỏng; quầy đã khóa để tránh bán trùng.', null, storageKey);
      if (parsed.ownerUserId !== ownerUserId) return blocked('Còn giao dịch chưa kiểm tra của tài khoản khác. Tài khoản đó cần xử lý giao dịch trước khi bán tiếp.', parsed, storageKey);
      if (Date.now() - parsed.createdAt > maxPendingAgeMs) return blocked('Giao dịch đang chờ đã quá thời hạn gửi lại an toàn. Cần kiểm tra đơn thủ công trước khi tiếp tục.', parsed, storageKey);
      return { storageKey, record: parsed, view: stateForRecord(parsed) };
    }

    const legacyKey = `${legacyPendingStoragePrefix}:${tillId}`;
    const legacyRaw = storage.getItem(legacyKey);
    if (legacyRaw !== null) {
      const legacy: unknown = JSON.parse(legacyRaw);
      if (!validPendingV2(legacy)) return blocked('Dữ liệu giao dịch cũ bị hỏng; quầy đã khóa để tránh bán trùng.', null, storageKey);
      if (legacy.ownerUserId !== ownerUserId) return blocked('Còn giao dịch cũ chưa kiểm tra của tài khoản khác. Tài khoản đó cần xử lý trước khi bán tiếp.', null, storageKey);
      if (Date.now() - legacy.createdAt > maxPendingAgeMs) return blocked('Giao dịch cũ đã quá thời hạn gửi lại an toàn. Cần kiểm tra đơn thủ công trước khi tiếp tục.', null, storageKey);
      const migrated: PendingSaleV3 = {
        version: 3,
        ownerUserId: legacy.ownerUserId,
        createdAt: legacy.createdAt,
        updatedAt: Date.now(),
        phase: 'creating',
        attempt: legacy.attempt,
        createRequest: legacy.request,
        cart: cloneCart(legacy.cart),
        // The older UI did not collect or confirm payment. Replaying it can recover the
        // order, but must not silently confirm payment with invented cashier evidence.
        payment: null,
        paymentKey: null,
        orderId: null,
        orderReference: null,
        blockedReason: null,
      };
      writePending(storageKey, migrated);
      storage.removeItem(legacyKey);
      return { storageKey, record: migrated, view: stateForRecord(migrated) };
    }

    return { storageKey, record: null, view: { status: 'new', pendingCart: null, reference: null, orderId: null, payment: null, blockedReason: null } };
  } catch (error) {
    return blocked(error instanceof Error ? error.message : 'Không đọc được giao dịch bán hàng đã lưu.', null, storageKey);
  }
}

function isIndeterminate(error: unknown): boolean {
  if (error instanceof ApiRequestError) return error.status === 0 || error.status >= 500;
  return true;
}

function isIdempotencyConflict(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === 'IDEMPOTENCY_CONFLICT';
}

function isStockConflict(error: unknown): boolean {
  return error instanceof ApiRequestError && [
    'INSUFFICIENT_STOCK',
    'POS_QUOTA_INSUFFICIENT',
    'POS_ALLOCATION_TRANSITIONING',
    'POS_ALLOCATION_NOT_READY',
    'STATE_CONFLICT',
  ].includes(error.code);
}

function toSale(order: Order, reference: string): PosSale {
  return {
    orderId: order.id,
    reference: order.reference ?? reference,
    status: order.status,
    paymentStatus: order.payment_status,
    currency: order.currency,
    totalMinor: order.total_minor,
    itemCount: order.item_count,
    replayed: false,
  };
}

/** Rebuild the exact priced basket returned with a newly created order. */
function cartFromOrder(order: Order, requestedCart: readonly CartItem[]): CartItem[] | null {
  if (!Array.isArray(order.items) || order.items.length !== requestedCart.length
    || !Number.isSafeInteger(order.total_minor) || order.total_minor < 0
    || !Number.isSafeInteger(order.item_count) || order.item_count < 1
    || typeof order.currency !== 'string' || order.currency.length !== 3) return null;
  const requestedBySku = new Map(requestedCart.map((item) => [item.sku, item]));
  if (requestedBySku.size !== requestedCart.length) return null;
  const orderItemsBySku = new Map(order.items.map((line) => [line.sku, line]));
  if (orderItemsBySku.size !== order.items.length || orderItemsBySku.size !== requestedBySku.size) return null;
  const cart: CartItem[] = [];
  let total = 0n;
  let itemCount = 0;
  for (const requested of requestedCart) {
    const line = orderItemsBySku.get(requested.sku);
    if (!line || !Number.isSafeInteger(line.quantity) || line.quantity <= 0
      || line.quantity !== requested.qty
      || !Number.isSafeInteger(line.unit_price_minor) || line.unit_price_minor < 0
      || !Number.isSafeInteger(line.line_total_minor) || line.line_total_minor < 0) return null;
    const lineTotal = BigInt(line.unit_price_minor) * BigInt(line.quantity);
    if (lineTotal !== BigInt(line.line_total_minor)) return null;
    total += lineTotal;
    itemCount += line.quantity;
    cart.push({
      ...requested,
      name: line.name || requested.name,
      unitPrice: line.unit_price_minor,
      currency: order.currency,
    });
  }
  if (total !== BigInt(order.total_minor) || itemCount !== order.item_count || !hasOneCurrency(cart)
    || !cart.every(validCartItem) || cartTotalMinor(cart) === null) return null;
  return cart;
}

function sameFinancialBasket(left: readonly CartItem[], right: readonly CartItem[]): boolean {
  if (left.length !== right.length || cartTotalMinor(left) !== cartTotalMinor(right)) return false;
  const rightBySku = new Map(right.map((item) => [item.sku, item]));
  return left.every((item) => {
    const counterpart = rightBySku.get(item.sku);
    return counterpart !== undefined && item.qty === counterpart.qty
      && item.unitPrice === counterpart.unitPrice && item.currency === counterpart.currency;
  });
}

export function useSaleAttempt(ownerUserId: string) {
  const initialRef = useRef<InitialState | null>(null);
  if (initialRef.current === null) initialRef.current = initialize(ownerUserId);
  const initial = initialRef.current;
  const [view, setView] = useState<SaleAttemptView>(initial.view);
  const viewRef = useRef(view);
  const ownerRef = useRef(ownerUserId);
  const tillIdRef = useRef(initial.storageKey?.slice(initial.storageKey.lastIndexOf(':') + 1) ?? '');
  const recordRef = useRef<PendingSaleV3 | null>(initial.record);
  const storageKeyRef = useRef<string | null>(initial.storageKey);
  const inFlightRef = useRef<Promise<SaleOutcome> | null>(null);
  const minted = useRef(0);

  const updateView = useCallback((next: SaleAttemptView) => {
    viewRef.current = next;
    setView(next);
  }, []);

  const failBlocked = useCallback((reason: string, error: unknown = new Error(reason)): SaleOutcome => {
    const record = recordRef.current;
    const sameOwner = record?.ownerUserId === ownerUserId;
    updateView({
      status: 'blocked',
      pendingCart: sameOwner && record ? cloneCart(record.cart) : null,
      reference: record?.orderReference ?? record?.attempt.reference ?? null,
      orderId: record?.orderId ?? null,
      payment: sameOwner ? record?.payment ?? null : null,
      blockedReason: reason,
    });
    return { kind: 'failed', error, indeterminate: true, blocked: true };
  }, [ownerUserId, updateView]);

  const blockKnownOrder = useCallback((pending: PendingSaleV3, order: Order, reason: string): SaleOutcome => {
    const blockedRecord: PendingSaleV3 = {
      ...pending,
      phase: 'blocked',
      orderId: order.id,
      orderReference: order.reference,
      payment: null,
      paymentKey: null,
      blockedReason: reason,
      updatedAt: Date.now(),
    };
    try {
      const storageKey = storageKeyRef.current;
      if (!storageKey) throw new Error('Không tìm thấy giao dịch đã lưu để khóa quầy an toàn.');
      writePending(storageKey, blockedRecord);
      recordRef.current = blockedRecord;
    } catch (error) {
      return failBlocked(error instanceof Error ? error.message : 'Không thể khóa giao dịch cần đối soát.', error);
    }
    updateView({
      status: 'blocked',
      pendingCart: cloneCart(blockedRecord.cart),
      reference: order.reference ?? pending.attempt.reference,
      orderId: order.id,
      payment: null,
      blockedReason: reason,
    });
    return { kind: 'failed', error: new Error(reason), indeterminate: true, blocked: true };
  }, [failBlocked, updateView]);

  const finishPaid = useCallback((order: Order, pending: PendingSaleV3): SaleOutcome => {
    const storageKey = storageKeyRef.current;
    try {
      if (!storageKey) throw new Error('Không tìm thấy vị trí lưu giao dịch đã hoàn tất.');
      removePending(storageKey, tillIdRef.current);
      recordRef.current = null;
      updateView({ status: 'confirmed', pendingCart: null, reference: order.reference ?? pending.attempt.reference, orderId: order.id, payment: null, blockedReason: null });
    } catch (storageError) {
      updateView({
        status: 'blocked',
        pendingCart: cloneCart(pending.cart),
        reference: order.reference ?? pending.attempt.reference,
        orderId: order.id,
        payment: pending.payment,
        blockedReason: storageError instanceof Error ? storageError.message : 'Không thể dọn giao dịch đã hoàn tất khỏi thiết bị.',
      });
      return { kind: 'sold', sale: toSale(order, pending.attempt.reference), error: storageError, indeterminate: false, blocked: true };
    }
    return { kind: 'sold', sale: toSale(order, pending.attempt.reference), indeterminate: false };
  }, [updateView]);

  const runSubmit = useCallback(async (
    items: readonly CartItem[],
    requestedPayment: SalePaymentInstruction | null,
    discountMinor = 0,
    discountReason = '',
  ): Promise<SaleOutcome> => {
    if (ownerUserId !== ownerRef.current) return failBlocked('Tài khoản đã thay đổi khi giao dịch đang mở.');
    if (viewRef.current.status === 'blocked') {
      return { kind: 'failed', error: new Error(viewRef.current.blockedReason ?? 'Quầy bán hàng đang bị khóa.'), indeterminate: true, blocked: true };
    }
    const storageKey = storageKeyRef.current;
    if (!storageKey) return failBlocked('Thiết bị không lưu được giao dịch này một cách an toàn.');

    let pending = recordRef.current;
    const isResuming = pending !== null;
    if (pending) {
      if (!sameCart(items, pending.cart)) {
        return { kind: 'failed', error: new Error('Cần kiểm tra giao dịch đang chờ bằng đúng giỏ hàng đã gửi.'), indeterminate: true, blocked: true };
      }
      if (pending.phase === 'creating' && ((pending.createRequest.discount_minor ?? 0) !== discountMinor || (pending.createRequest.discount_reason ?? '') !== discountReason.trim())) {
        return { kind: 'failed', error: new Error('Giảm giá của giao dịch đang chờ đã được khóa; hãy tiếp tục đúng yêu cầu đã lưu.'), indeterminate: true, blocked: true };
      }
      if (pending.phase === 'awaiting_payment') {
        const subtotal = cartTotalMinor(pending.cart);
        const savedDiscount = pending.createRequest.discount_minor ?? 0;
        const total = subtotal === null || savedDiscount > subtotal ? null : subtotal - savedDiscount;
        if (total === null || !requestedPayment || !validPayment(requestedPayment, total)) {
          return { kind: 'failed', error: new Error('Cần xác nhận phương thức thanh toán trước khi ghi nhận payment.'), indeterminate: false };
        }
        pending = {
          ...pending,
          phase: 'confirming',
          payment: { ...requestedPayment },
          paymentKey: mintPaymentKey(pending.attempt, Date.now(), minted.current++),
          updatedAt: Date.now(),
        };
      } else if (pending.phase === 'confirming' && pending.payment && requestedPayment && !samePayment(pending.payment, requestedPayment)) {
        return { kind: 'failed', error: new Error('Payload xác nhận thanh toán đã được lưu và không thể thay đổi khi giao dịch còn chờ.'), indeterminate: true, blocked: true };
      }
      pending = { ...pending, updatedAt: Date.now() };
    } else {
      if (!validCart(items)) return { kind: 'failed', error: new Error('Giỏ hàng không hợp lệ hoặc tổng tiền không an toàn.'), indeterminate: false };
      const subtotal = cartTotalMinor(items);
      const total = subtotal === null || discountMinor > subtotal ? null : subtotal - discountMinor;
      if (total === null || !requestedPayment || !validPayment(requestedPayment, total)) {
        return { kind: 'failed', error: new Error('Xác nhận số tiền đã nhận trước khi tạo đơn.'), indeterminate: false };
      }
      const cart = cloneCart(items);
      const baseRequest = {
        channel_code: 'pos',
        lines: cart.map((item) => ({ sku: item.sku, quantity: item.qty })),
        ...(discountMinor > 0 ? { discount_minor: discountMinor, discount_reason: discountReason.trim() } : {}),
        payment_method: requestedPayment.method === 'cash' ? 'cash' as const : 'bank_transfer' as const,
        ...(requestedPayment.method === 'cash' ? { cash_received_minor: requestedPayment.receivedMinor } : {}),
      } satisfies Omit<CreateOrderInput, 'reference'>;
      const attempt = mintAttempt(baseRequest, Date.now(), minted.current++);
      pending = {
        version: 3,
        ownerUserId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        phase: 'creating',
        attempt,
        createRequest: { ...baseRequest, reference: attempt.reference },
        cart,
        payment: { ...requestedPayment },
        paymentKey: mintPaymentKey(attempt, Date.now(), minted.current++),
        orderId: null,
        orderReference: null,
        blockedReason: null,
      };
    }

    try {
      writePending(storageKey, pending);
    } catch (error) {
      return failBlocked(error instanceof Error ? error.message : 'Không lưu được giao dịch đang chờ.', error);
    }
    recordRef.current = pending;
    updateView({
      status: 'submitting',
      pendingCart: cloneCart(pending.cart),
      reference: pending.orderReference ?? pending.attempt.reference,
      orderId: pending.orderId,
      payment: pending.payment,
      blockedReason: null,
    });

    try {
      verifyPending(storageKey, pending);
    } catch (error) {
      return failBlocked(error instanceof Error ? error.message : 'Không kiểm tra được giao dịch đang chờ.', error);
    }

    if (pending.phase === 'creating') {
      let order: Order;
      try {
        order = await createOrder(pending.createRequest, pending.attempt.key);
      } catch (error) {
        if (isIdempotencyConflict(error)) return failBlocked('Khóa giao dịch đã được dùng với nội dung khác. Cần đối soát đơn theo mã tham chiếu trước khi bán tiếp.', error);
        if (isIndeterminate(error)) {
          const indeterminate = { ...pending, phase: 'creating' as const, updatedAt: Date.now() };
          recordRef.current = indeterminate;
          try { writePending(storageKey, indeterminate); } catch { /* the verified creating record is still safe to replay */ }
          updateView({ status: 'indeterminate', pendingCart: cloneCart(indeterminate.cart), reference: indeterminate.attempt.reference, orderId: null, payment: indeterminate.payment, blockedReason: null });
          return { kind: 'failed', error, indeterminate: true };
        }
        try {
          removePending(storageKey, tillIdRef.current);
          recordRef.current = null;
          updateView({ status: 'rejected', pendingCart: null, reference: pending.attempt.reference, orderId: null, payment: null, blockedReason: null });
        } catch (storageError) {
          return failBlocked(storageError instanceof Error ? storageError.message : 'Không thể dọn giao dịch bị từ chối.', storageError);
        }
        return { kind: 'failed', error, stockConflict: isStockConflict(error), indeterminate: false };
      }

      if (order.payment_status === 'paid') return finishPaid(order, pending);
      const serverCart = cartFromOrder(order, pending.cart);
      if (!serverCart) {
        return blockKnownOrder(pending, order, 'Đơn đã tồn tại nhưng chi tiết SKU, số lượng hoặc tổng tiền máy chủ trả về không khớp an toàn với giỏ. Quầy bị khóa để đối soát đơn trước khi nhận tiền.');
      }
      if (!sameFinancialBasket(serverCart, pending.cart)) {
        const reviewedPending: PendingSaleV3 = {
          ...pending,
          phase: 'awaiting_payment',
          cart: serverCart,
          payment: null,
          paymentKey: null,
          orderId: order.id,
          orderReference: order.reference,
          blockedReason: null,
          updatedAt: Date.now(),
        };
        recordRef.current = reviewedPending;
        try {
          writePending(storageKey, reviewedPending);
        } catch (error) {
          return failBlocked(error instanceof Error ? error.message : 'Đơn đã tạo nhưng không lưu được giá thực tế để đối soát.', error);
        }
        updateView({ status: 'payment-pending', pendingCart: cloneCart(serverCart), reference: order.reference, orderId: order.id, payment: null, blockedReason: null });
        return {
          kind: 'payment-pending',
          sale: toSale(order, pending.attempt.reference),
          error: new Error('Giá hoặc loại tiền của SKU đã đổi khi máy chủ tạo đơn. Đơn chưa được thanh toán; kiểm tra tổng tiền mới và nhập lại thông tin tiền nhận.'),
          indeterminate: false,
          requiresPaymentReview: true,
        };
      }
      const awaitingPayment = {
        ...pending,
        phase: pending.payment ? 'confirming' as const : 'awaiting_payment' as const,
        cart: serverCart,
        orderId: order.id,
        orderReference: order.reference,
        blockedReason: null,
        updatedAt: Date.now(),
      };
      recordRef.current = awaitingPayment;
      try {
        writePending(storageKey, awaitingPayment);
      } catch (error) {
        return failBlocked(error instanceof Error ? error.message : 'Đơn đã tạo nhưng không lưu được phần đối soát thanh toán.', error);
      }
      pending = awaitingPayment;
      if (!pending.payment || !pending.paymentKey) {
        updateView({ status: 'payment-pending', pendingCart: cloneCart(pending.cart), reference: order.reference, orderId: order.id, payment: null, blockedReason: null });
        return { kind: 'payment-pending', sale: toSale(order, pending.attempt.reference), indeterminate: false };
      }
      return await confirmPayment(pending, order);
    }

    if (pending.phase === 'awaiting_payment') {
      updateView({ status: 'payment-pending', pendingCart: cloneCart(pending.cart), reference: pending.orderReference, orderId: pending.orderId, payment: null, blockedReason: null });
      return { kind: 'failed', error: new Error('Chọn phương thức thanh toán đã nhận trước khi tiếp tục.'), indeterminate: false };
    }

    // A resumed payment attempt always reads the server first. If a response was lost after
    // commit, the GET finds paid and avoids a second confirmation request.
    if (isResuming) return await confirmPayment(pending);
    return await confirmPayment(pending);
  }, [blockKnownOrder, failBlocked, finishPaid, ownerUserId, updateView]);

  async function confirmPayment(pending: PendingSaleV3, knownOrder?: Order): Promise<SaleOutcome> {
    let currentOrder = knownOrder;
    if (!currentOrder) {
      try {
        if (!pending.orderId) throw new Error('Không tìm thấy mã đơn để đối soát thanh toán.');
        currentOrder = await getOrder(pending.orderId);
      } catch (error) {
        updateView({ status: 'payment-indeterminate', pendingCart: cloneCart(pending.cart), reference: pending.orderReference ?? pending.attempt.reference, orderId: pending.orderId, payment: pending.payment, blockedReason: null });
        return { kind: 'failed', error, indeterminate: true };
      }
    }

    if (currentOrder.payment_status === 'paid') return finishPaid(currentOrder, pending);
    if (currentOrder.status === 'cancelled' || currentOrder.payment_status !== 'pending') {
      return failBlocked('Đơn đã chuyển trạng thái trên máy chủ. Không gửi lại xác nhận thanh toán; cần đối soát đơn này.', new Error(`order=${currentOrder.status}, payment=${currentOrder.payment_status}`));
    }
    const serverCart = cartFromOrder(currentOrder, pending.cart);
    if (!serverCart || !sameFinancialBasket(serverCart, pending.cart)) {
      return blockKnownOrder(pending, currentOrder, 'Tổng tiền hoặc chi tiết đơn trên máy chủ đã khác giỏ đang chờ. Không gửi xác nhận thanh toán; quầy bị khóa để đối soát đơn.');
    }
    if (!pending.payment || !pending.paymentKey) {
      updateView({ status: 'payment-pending', pendingCart: cloneCart(pending.cart), reference: pending.orderReference, orderId: pending.orderId, payment: null, blockedReason: null });
      return { kind: 'payment-pending', sale: toSale(currentOrder, pending.attempt.reference), indeterminate: false };
    }

    try {
      verifyPending(storageKeyRef.current ?? '', pending);
      const confirmed = await confirmOrderPayment(pending.orderId!, pending.payment.note, pending.paymentKey);
      if (confirmed.payment_status !== 'paid') {
        throw new Error('Máy chủ trả lời nhưng chưa xác nhận payment_status=paid.');
      }
      return finishPaid(confirmed, pending);
    } catch (error) {
      if (isIdempotencyConflict(error)) return failBlocked('Khóa xác nhận thanh toán đã được dùng với payload khác. Không tạo đơn hoặc khóa mới; cần đối soát với người quản lý.', error);
      let reconciled: Order | null = null;
      try {
        reconciled = await getOrder(pending.orderId!);
      } catch {
        // Unknown remains unknown; the next action reads the order again before retrying.
      }
      if (reconciled?.payment_status === 'paid') return finishPaid(reconciled, pending);
      const uncertain = !reconciled || isIndeterminate(error);
      const nextStatus: SaleAttemptStatus = uncertain ? 'payment-indeterminate' : 'payment-pending';
      updateView({
        status: nextStatus,
        pendingCart: cloneCart(pending.cart),
        reference: pending.orderReference ?? pending.attempt.reference,
        orderId: pending.orderId,
        payment: pending.payment,
        blockedReason: null,
      });
      return {
        kind: 'payment-pending',
        ...(reconciled ? { sale: toSale(reconciled, pending.attempt.reference) } : {}),
        error,
        indeterminate: uncertain,
      };
    }
  }

  const submit = useCallback((items: readonly CartItem[], payment: SalePaymentInstruction | null, discountMinor = 0, discountReason = ''): Promise<SaleOutcome> => {
    if (inFlightRef.current) return inFlightRef.current;
    const task = runSubmit(items, payment, discountMinor, discountReason);
    inFlightRef.current = task;
    void task.then(
      () => { if (inFlightRef.current === task) inFlightRef.current = null; },
      () => { if (inFlightRef.current === task) inFlightRef.current = null; },
    );
    return task;
  }, [runSubmit]);

  const reset = useCallback((): boolean => {
    if (recordRef.current || ['submitting', 'indeterminate', 'payment-pending', 'payment-indeterminate', 'blocked'].includes(viewRef.current.status)) return false;
    updateView({ status: 'new', pendingCart: null, reference: null, orderId: null, payment: null, blockedReason: null });
    return true;
  }, [updateView]);

  useEffect(() => {
    if (ownerUserId !== ownerRef.current && viewRef.current.status !== 'blocked') {
      void failBlocked('Tài khoản đã thay đổi khi giao dịch đang mở.');
    }
  }, [failBlocked, ownerUserId]);

  return {
    submit,
    reset,
    submitting: view.status === 'submitting',
    status: view.status,
    pendingCart: view.pendingCart,
    reference: view.reference,
    orderId: view.orderId,
    payment: view.payment,
    blockedReason: view.blockedReason,
  };
}
