import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrderApiHistory } from './OrderApiHistory';

const { getOrderHistory } = vi.hoisted(() => ({ getOrderHistory: vi.fn() }));
vi.mock('../../../api/orders', () => ({ getOrderHistory }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('OrderApiHistory', () => {
  it('renders the recorded transitions and cancellation reason from the API', async () => {
    getOrderHistory.mockResolvedValue({ history: [
      { id: 8, from_status: 'packed', to_status: 'cancelled', reason: 'Khách yêu cầu hủy', changed_at: '2026-10-13T04:00:00Z' },
      { id: 7, from_status: 'confirmed', to_status: 'packed', changed_at: '2026-10-13T03:00:00Z' },
    ] });
    render(<OrderApiHistory orderId="order-1" />);

    await waitFor(() => expect(screen.getByText('Đã đóng gói → Đã hủy')).toBeInTheDocument());
    expect(screen.getByText('Lý do: Khách yêu cầu hủy')).toBeInTheDocument();
    expect(screen.getByText('Đã xác nhận → Đã đóng gói')).toBeInTheDocument();
    expect(getOrderHistory).toHaveBeenCalledWith('order-1', expect.any(AbortSignal));
  });

  it('shows an empty state when the API has no recorded transitions', async () => {
    getOrderHistory.mockResolvedValue({ history: [] });
    render(<OrderApiHistory orderId="order-2" />);
    await waitFor(() => expect(screen.getByText('Chưa có thay đổi trạng thái được ghi nhận.')).toBeInTheDocument());
  });
});
