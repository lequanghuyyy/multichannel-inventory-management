import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { OrderApiRow } from '../order.api';
import { OrderCustomerDeliverySection } from './OrderCustomerDeliverySection';
import { OrderUnifiedShippingSection } from './OrderUnifiedShippingSection';

describe('order contact and shipping details', () => {
  it('uses a channel-specific missing buyer name without inventing a recipient', () => {
    const { rerender } = render(<OrderCustomerDeliverySection channelCode="shopify" />);
    expect(screen.getByText('Chưa có thông tin khách hàng')).toBeInTheDocument();
    expect(screen.getByText('Người nhận & Vận chuyển')).toBeInTheDocument();
    rerender(<OrderCustomerDeliverySection channelCode="pos" />);
    expect(screen.getByText('Khách lẻ tại quầy')).toBeInTheDocument();
  });

  it('shows carrier and tracking only when actual values exist', () => {
    const order = { channelCode: 'shopify', unifiedShipping: { delivery_status: 'pending_preparation' } } as OrderApiRow;
    const { rerender } = render(<OrderUnifiedShippingSection order={order} />);
    expect(screen.queryByText('Hãng vận chuyển')).not.toBeInTheDocument();
    expect(screen.queryByText('Mã vận đơn (Tracking Number)')).not.toBeInTheDocument();
    expect(screen.queryByText('Đường dẫn tra cứu vận đơn')).not.toBeInTheDocument();
    rerender(<OrderUnifiedShippingSection order={{ ...order, unifiedShipping: {
      ...order.unifiedShipping, carrier: 'Carrier', tracking_number: 'TRACK-1', tracking_url: 'https://example.com/track',
    } } as OrderApiRow} />);
    expect(screen.getByText('Carrier')).toBeInTheDocument();
    expect(screen.getByText('TRACK-1')).toBeInTheDocument();
    expect(screen.getByText('Tra cứu bưu gửi')).toBeInTheDocument();
  });
});
