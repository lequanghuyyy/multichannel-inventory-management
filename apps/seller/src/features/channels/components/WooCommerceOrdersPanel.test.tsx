import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WooCommerceOrderDetail, WooCommerceOrderReceipt } from '../../../api/woocommerce';
import { WooCommerceOrdersPanel } from './WooCommerceOrdersPanel';

const api = vi.hoisted(() => ({ getWooCommerceOrderDetail: vi.fn(), getWooCommerceOrders: vi.fn(), retryWooCommerceOrder: vi.fn() }));
vi.mock('../../../api/woocommerce', () => ({ ...api }));
vi.mock('../../../app/routes', () => ({ navigate: vi.fn() }));

const receipt: WooCommerceOrderReceipt = {
  external_order_id: '501', woocommerce_status: 'processing', import_result: 'imported', last_seen_at: '2026-10-31T03:00:00Z',
  source: 'webhook', retry_count: 0, manual_retry_count: 0,
};
const detail: WooCommerceOrderDetail = {
  order: {
    id: 501, status: 'processing', date_created_gmt: '2026-10-31T02:00:00Z', date_modified_gmt: '2026-10-31T03:00:00Z',
    currency: 'VND', total: '120000', total_tax: '10000', cart_tax: '9000', discount_tax: '1000', shipping_total: '15000',
    shipping_tax: '1000', discount_total: '5000', payment_method: 'cod', payment_method_title: 'Cash on delivery', customer_note: 'Call first',
    billing: { first_name: 'An', last_name: 'Nguyen', address_1: '12 Buyer Street', email: 'buyer@example.test', phone: '0900000000' },
    shipping: { first_name: 'An', address_1: '34 Delivery Road', city: 'HCMC', country: 'VN' },
    line_items: [{ id: 1, product_id: 77, variation_id: 78, name: 'Tee', sku: 'TEE-001', quantity: 1, price: '110000', subtotal: '115000', subtotal_tax: '9000', total: '110000', total_tax: '9000', taxes: [] }],
    tax_lines: [], shipping_lines: [], coupon_lines: [], fee_lines: [],
  }, notes: [{ id: 91, note: 'Packed with care', customer_note: false, date_created_gmt: '2026-10-31T03:30:00Z' }], notes_available: true,
};

beforeEach(() => {
  api.getWooCommerceOrders.mockResolvedValue([receipt]);
  api.getWooCommerceOrderDetail.mockResolvedValue(detail);
  api.retryWooCommerceOrder.mockResolvedValue({ external_order_id: '501', webhook_queued: true });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('WooCommerceOrdersPanel', () => {
  it('loads PII and full price details only after an ADMIN opens order detail', async () => {
    render(<WooCommerceOrdersPanel channelId="channel-1" canManage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Chi tiết WooCommerce' }));
    expect(await screen.findByText('buyer@example.test')).toBeInTheDocument();
    expect(screen.getByText('12 Buyer Street')).toBeInTheDocument();
    expect(screen.getByText('Call first')).toBeInTheDocument();
    expect(screen.getByText('Packed with care')).toBeInTheDocument();
    expect(api.getWooCommerceOrderDetail).toHaveBeenCalledWith('channel-1', '501', expect.any(AbortSignal));
  });

  it('does not offer the PII detail request to STAFF', async () => {
    render(<WooCommerceOrdersPanel channelId="channel-1" canManage={false} />);
    await waitFor(() => expect(screen.getByText('WooCommerce #501')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Chi tiết WooCommerce' })).not.toBeInTheDocument();
    expect(api.getWooCommerceOrderDetail).not.toHaveBeenCalled();
  });
});
