import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../core/api-error';
import type { Order } from '../../api/orders';
import { useSaleAttempt } from './useSaleAttempt';
import type { CartItem, SalePaymentInstruction } from './pos.types';

const { createOrder, getOrder, confirmOrderPayment } = vi.hoisted(() => ({
  createOrder: vi.fn(),
  getOrder: vi.fn(),
  confirmOrderPayment: vi.fn(),
}));
vi.mock('../../api/orders', () => ({ createOrder, getOrder, confirmOrderPayment }));

const owner = '70000000-0000-4000-8000-000000000001';
const pendingOrder: Order = {
  id: '30000000-0000-4000-8000-000000000001',
  reference: 'POS-20261004-0001',
  channel_code: 'pos',
  status: 'confirmed',
  payment_status: 'pending',
  fulfillment_status: 'pending',
  currency: 'VND',
  item_count: 2,
  total_minor: 1980000,
  items: [{
    variant_id: '20000000-0000-4000-8000-000000000001',
    reservation_id: '40000000-0000-4000-8000-000000000001',
    sku: 'SHOE-001-BLK-42',
    name: 'Running Shoe 001',
    quantity: 2,
    unit_price_minor: 990000,
    line_total_minor: 1980000,
  }],
  placed_at: '2026-10-04T09:00:00Z',
  updated_at: '2026-10-04T09:00:00Z',
};
const paidOrder: Order = { ...pendingOrder, payment_status: 'paid' };
const item = (overrides: Partial<CartItem> = {}): CartItem => ({
  sku: 'SHOE-001-BLK-42',
  name: 'Running Shoe 001',
  variant: 'BLACK / Size 42',
  unitPrice: 990000,
  currency: 'VND',
  qty: 2,
  maxQty: 7,
  ...overrides,
});
const cart = [item()];
const cashPayment: SalePaymentInstruction = {
  method: 'cash',
  receivedMinor: 2000000,
  changeMinor: 20000,
  note: 'POS cash received; received_minor=2000000; change_minor=20000; currency=VND.',
};
const apiError = (code: string, status: number, message = 'lỗi') => new ApiRequestError({ code, message, request_id: 'req-1' }, status);
const createKey = (call: number) => createOrder.mock.calls[call]?.[1] as string;
const createInput = (call: number) => createOrder.mock.calls[call]?.[0] as { reference: string; channel_code: string; lines: { sku: string; quantity: number }[] };
const paymentKey = (call: number) => confirmOrderPayment.mock.calls[call]?.[2] as string;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('useSaleAttempt', () => {
  it('creates one order and confirms payment before reporting a completed sale', async () => {
    createOrder.mockResolvedValue(pendingOrder);
    confirmOrderPayment.mockResolvedValue(paidOrder);
    const { result } = renderHook(() => useSaleAttempt(owner));

    let outcome: Awaited<ReturnType<typeof result.current.submit>> | undefined;
    await act(async () => { outcome = await result.current.submit(cart, cashPayment); });

    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(createInput(0)).toMatchObject({ channel_code: 'pos', lines: [{ sku: item().sku, quantity: 2 }] });
    expect(confirmOrderPayment).toHaveBeenCalledWith(pendingOrder.id, cashPayment.note, expect.stringMatching(/^pos-pay-/));
    expect(outcome).toMatchObject({ kind: 'sold', sale: { orderId: pendingOrder.id, totalMinor: 1980000, paymentStatus: 'paid' } });
    expect(result.current.status).toBe('confirmed');
    expect(result.current.pendingCart).toBeNull();
  });

  it('rejects missing or insufficient payment details before creating an order', async () => {
    const { result } = renderHook(() => useSaleAttempt(owner));
    const insufficient = { ...cashPayment, receivedMinor: 1979999, changeMinor: 0 };
    let missing: Awaited<ReturnType<typeof result.current.submit>> | undefined;
    let short: Awaited<ReturnType<typeof result.current.submit>> | undefined;
    await act(async () => { missing = await result.current.submit(cart, null); });
    await act(async () => { short = await result.current.submit(cart, insufficient); });

    expect(missing).toMatchObject({ kind: 'failed', indeterminate: false });
    expect(short).toMatchObject({ kind: 'failed', indeterminate: false });
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('replays the same create key and payload after an unknown order response', async () => {
    createOrder.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(pendingOrder);
    confirmOrderPayment.mockResolvedValue(paidOrder);
    const { result } = renderHook(() => useSaleAttempt(owner));

    await act(async () => { await result.current.submit(cart, cashPayment); });
    expect(result.current.status).toBe('indeterminate');
    await act(async () => { await result.current.submit(cart, cashPayment); });

    expect(createOrder).toHaveBeenCalledTimes(2);
    expect(createKey(1)).toBe(createKey(0));
    expect(createInput(1)).toEqual(createInput(0));
    expect(confirmOrderPayment).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('confirmed');
  });

  it('retains the exact payment key and payload after payment timeout, then reconciles by reading the order', async () => {
    createOrder.mockResolvedValue(pendingOrder);
    confirmOrderPayment.mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce(paidOrder);
    getOrder.mockResolvedValue(pendingOrder);
    const { result } = renderHook(() => useSaleAttempt(owner));

    await act(async () => { await result.current.submit(cart, cashPayment); });
    expect(result.current.status).toBe('payment-indeterminate');
    const firstKey = paymentKey(0);
    const firstNote = confirmOrderPayment.mock.calls[0]?.[1];

    await act(async () => { await result.current.submit(cart, cashPayment); });

    expect(getOrder).toHaveBeenCalledWith(pendingOrder.id);
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(confirmOrderPayment).toHaveBeenCalledTimes(2);
    expect(paymentKey(1)).toBe(firstKey);
    expect(confirmOrderPayment.mock.calls[1]?.[1]).toBe(firstNote);
    expect(result.current.status).toBe('confirmed');
  });

  it('does not repeat payment confirmation if the lost response already committed', async () => {
    createOrder.mockResolvedValue(pendingOrder);
    confirmOrderPayment.mockRejectedValue(new Error('response lost'));
    getOrder.mockResolvedValue(paidOrder);
    const { result } = renderHook(() => useSaleAttempt(owner));

    let outcome: Awaited<ReturnType<typeof result.current.submit>> | undefined;
    await act(async () => { outcome = await result.current.submit(cart, cashPayment); });

    expect(getOrder).toHaveBeenCalledWith(pendingOrder.id);
    expect(confirmOrderPayment).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ kind: 'sold', sale: { paymentStatus: 'paid' } });
    expect(result.current.status).toBe('confirmed');
  });

  it('stops before payment when the created order captured a newer server price', async () => {
    const repricedOrder: Order = {
      ...pendingOrder,
      total_minor: 2100000,
      items: [{ ...pendingOrder.items![0]!, unit_price_minor: 1050000, line_total_minor: 2100000 }],
    };
    const paidRepricedOrder: Order = { ...repricedOrder, payment_status: 'paid' };
    createOrder.mockResolvedValue(repricedOrder);
    getOrder.mockResolvedValue(repricedOrder);
    confirmOrderPayment.mockResolvedValue(paidRepricedOrder);
    const { result } = renderHook(() => useSaleAttempt(owner));

    let firstOutcome: Awaited<ReturnType<typeof result.current.submit>> | undefined;
    await act(async () => { firstOutcome = await result.current.submit(cart, cashPayment); });

    expect(firstOutcome).toMatchObject({ kind: 'payment-pending', requiresPaymentReview: true, sale: { totalMinor: 2100000 } });
    expect(result.current.status).toBe('payment-pending');
    expect(result.current.pendingCart?.[0]).toMatchObject({ unitPrice: 1050000, qty: 2 });
    expect(confirmOrderPayment).not.toHaveBeenCalled();

    const revisedCash: SalePaymentInstruction = {
      method: 'cash',
      receivedMinor: 2200000,
      changeMinor: 100000,
      note: 'POS cash received; received_minor=2200000; change_minor=100000; currency=VND.',
    };
    await act(async () => { await result.current.submit(result.current.pendingCart!, revisedCash); });
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(getOrder).toHaveBeenCalledWith(repricedOrder.id);
    expect(confirmOrderPayment).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('confirmed');
  });

  it('does not replace an unknown attempt with a changed basket', async () => {
    createOrder.mockRejectedValue(new Error('timeout'));
    const { result } = renderHook(() => useSaleAttempt(owner));
    await act(async () => { await result.current.submit(cart, cashPayment); });

    let outcome: Awaited<ReturnType<typeof result.current.submit>> | undefined;
    await act(async () => { outcome = await result.current.submit([item({ qty: 3 })], cashPayment); });

    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ kind: 'failed', indeterminate: true, blocked: true });
    expect(result.current.status).toBe('indeterminate');
  });

  it('persists and restores the complete attempt across reloads', async () => {
    createOrder.mockRejectedValue(new Error('response lost'));
    const first = renderHook(() => useSaleAttempt(owner));
    await act(async () => { await first.result.current.submit(cart, cashPayment); });
    const firstInput = createInput(0);
    const firstKey = createKey(0);
    const firstPaymentKey = paymentKey(0);
    first.unmount();

    createOrder.mockResolvedValue(pendingOrder);
    confirmOrderPayment.mockResolvedValue(paidOrder);
    const second = renderHook(() => useSaleAttempt(owner));
    expect(second.result.current.status).toBe('indeterminate');
    expect(second.result.current.pendingCart).toEqual(cart);
    await act(async () => { await second.result.current.submit(cart, cashPayment); });

    expect(createKey(1)).toBe(firstKey);
    expect(createInput(1)).toEqual(firstInput);
    expect(paymentKey(1)).toBe(firstPaymentKey);
    expect(second.result.current.status).toBe('confirmed');
  });

  it('locks a pending attempt to its original account', async () => {
    createOrder.mockRejectedValue(new Error('response lost'));
    const first = renderHook(() => useSaleAttempt(owner));
    await act(async () => { await first.result.current.submit(cart, cashPayment); });
    first.unmount();

    const second = renderHook(() => useSaleAttempt('70000000-0000-4000-8000-000000000002'));
    expect(second.result.current.status).toBe('blocked');
    expect(second.result.current.pendingCart).toBeNull();
    await act(async () => { await second.result.current.submit(cart, cashPayment); });
    expect(createOrder).toHaveBeenCalledTimes(1);
  });

  it('blocks an idempotency conflict instead of minting a replacement key', async () => {
    createOrder.mockRejectedValue(apiError('IDEMPOTENCY_CONFLICT', 409));
    const { result } = renderHook(() => useSaleAttempt(owner));
    let outcome: Awaited<ReturnType<typeof result.current.submit>> | undefined;
    await act(async () => { outcome = await result.current.submit(cart, cashPayment); });

    expect(outcome).toMatchObject({ kind: 'failed', indeterminate: true, blocked: true });
    expect(result.current.status).toBe('blocked');
    await act(async () => { await result.current.submit(cart, cashPayment); });
    expect(createOrder).toHaveBeenCalledTimes(1);
  });

  it('blocks a payment idempotency conflict without creating another order or payment key', async () => {
    createOrder.mockResolvedValue(pendingOrder);
    confirmOrderPayment.mockRejectedValue(apiError('IDEMPOTENCY_CONFLICT', 409));
    const { result } = renderHook(() => useSaleAttempt(owner));
    await act(async () => { await result.current.submit(cart, cashPayment); });

    expect(result.current.status).toBe('blocked');
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(confirmOrderPayment).toHaveBeenCalledTimes(1);
    const key = paymentKey(0);
    await act(async () => { await result.current.submit(cart, cashPayment); });
    expect(confirmOrderPayment).toHaveBeenCalledTimes(1);
    expect(paymentKey(0)).toBe(key);
  });

  it('keeps a stock conflict as a definitive rejection for refresh and review', async () => {
    createOrder.mockRejectedValue(apiError('INSUFFICIENT_STOCK', 409));
    const { result } = renderHook(() => useSaleAttempt(owner));
    let outcome: Awaited<ReturnType<typeof result.current.submit>> | undefined;
    await act(async () => { outcome = await result.current.submit(cart, cashPayment); });

    expect(outcome).toMatchObject({ kind: 'failed', stockConflict: true, indeterminate: false });
    expect(result.current.status).toBe('rejected');
    expect(result.current.pendingCart).toBeNull();
  });

  it('uses a synchronous mutex for a double confirm', async () => {
    const pending = deferred<Order>();
    createOrder.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useSaleAttempt(owner));
    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    act(() => { first = result.current.submit(cart, cashPayment); second = result.current.submit(cart, cashPayment); });

    expect(second).toBe(first);
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('submitting');
    await act(async () => { pending.resolve(pendingOrder); await first; });
    expect(confirmOrderPayment).toHaveBeenCalledTimes(1);
  });

  it('does not POST when durable storage cannot save the attempt', async () => {
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (this === window.localStorage) throw new Error('storage denied');
      return original.call(this, key, value);
    });
    const { result } = renderHook(() => useSaleAttempt(owner));
    await act(async () => { await result.current.submit(cart, cashPayment); });

    expect(createOrder).not.toHaveBeenCalled();
    expect(confirmOrderPayment).not.toHaveBeenCalled();
    expect(result.current.status).toBe('blocked');
  });
});
