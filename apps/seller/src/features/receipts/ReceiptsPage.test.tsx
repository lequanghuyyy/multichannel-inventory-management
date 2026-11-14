import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReceiptsPage } from './ReceiptsPage';
import type { ReceiptSummary } from '../../api/receipts';

const mockReceipts: ReceiptSummary[] = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    receipt_number: 'REC-20261012-001',
    supplier_name: 'Nike Vietnam',
    reference_number: 'INV-01',
    status: 'DRAFT',
    note: 'First shipment',
    created_by_email: 'admin@example.test',
    cancelled_reason: '',
    created_at: '2026-10-12T08:00:00Z',
    updated_at: '2026-10-12T08:00:00Z',
    item_count: 2,
    total_expected: 15,
    total_received: 0,
    total_inspected: 0,
    total_accepted: 0,
    total_rejected: 0,
    total_remaining: 15,
    pending_rejection_count: 0,
    version: 1,
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    receipt_number: 'REC-20261012-002',
    supplier_name: 'Adidas Global',
    reference_number: '',
    status: 'PARTIALLY_RECEIVED',
    note: '',
    created_by_email: 'staff@example.test',
    cancelled_reason: '',
    created_at: '2026-10-12T09:00:00Z',
    updated_at: '2026-10-12T09:30:00Z',
    received_at: '2026-10-12T09:30:00Z',
    item_count: 1,
    total_expected: 10,
    total_received: 6,
    total_inspected: 6,
    total_accepted: 6,
    total_rejected: 0,
    total_remaining: 4,
    pending_rejection_count: 0,
    version: 2,
  },
];

const listReceiptsMock = vi.fn();
vi.mock('../../api/receipts', () => ({
  listReceipts: (...args: unknown[]) => listReceiptsMock(...args),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ReceiptsPage', () => {
  it('renders receipt list from API with statuses and totals', async () => {
    listReceiptsMock.mockResolvedValueOnce({
      items: mockReceipts,
      nextCursor: undefined,
    });

    render(<ReceiptsPage />);

    expect(screen.getByText('Đang tải danh sách phiếu nhập…')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText('REC-20261012-001').length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText('Nike Vietnam').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Adidas Global').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bản nháp').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Nhận một phần').length).toBeGreaterThan(0);
  });

  it('filters by status when tab is clicked', async () => {
    listReceiptsMock.mockResolvedValue({
      items: [mockReceipts[0]],
      nextCursor: undefined,
    });

    render(<ReceiptsPage />);

    await waitFor(() => {
      expect(screen.getAllByText('REC-20261012-001').length).toBeGreaterThan(0);
    });

    const draftTab = screen.getByRole('tab', { name: 'Bản nháp' });
    fireEvent.click(draftTab);

    await waitFor(() => {
      expect(listReceiptsMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'DRAFT' })
      );
    });
  });

  it('renders empty state when no receipts are found', async () => {
    listReceiptsMock.mockResolvedValueOnce({
      items: [],
      nextCursor: undefined,
    });

    render(<ReceiptsPage />);

    await waitFor(() => {
      expect(screen.getByText('Chưa có phiếu nhập nào')).toBeInTheDocument();
    });
  });

  it('renders CLOSED_SHORT status and distinct quantity breakdown', async () => {
    const closedShortReceipt: ReceiptSummary = {
      id: '10000000-0000-4000-8000-000000000003',
      receipt_number: 'REC-20261012-003',
      supplier_name: 'Puma Vietnam',
      reference_number: 'REF-CS-01',
      status: 'CLOSED_SHORT',
      note: 'Partial supplier failure',
      created_by_email: 'staff@example.test',
      closed_short_reason: 'Nhà cung cấp hết hàng đợt 2',
      created_at: '2026-10-12T10:00:00Z',
      updated_at: '2026-10-12T11:00:00Z',
      item_count: 2,
      total_expected: 20,
      total_received: 12,
      total_inspected: 12,
      total_accepted: 10,
      total_rejected: 2,
      total_remaining: 8,
      pending_rejection_count: 1,
      version: 3,
    };

    listReceiptsMock.mockResolvedValueOnce({
      items: [closedShortReceipt],
      nextCursor: undefined,
    });

    render(<ReceiptsPage />);

    await waitFor(() => {
      expect(screen.getByText('REC-20261012-003')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Kết thúc sớm').length).toBeGreaterThan(0);
    expect(screen.getByText(/Nhà cung cấp hết hàng đợt 2/)).toBeInTheDocument();
    expect(screen.getByText(/1 chênh lệch lỗi cần xử lý/)).toBeInTheDocument();

    // Check distinct quantity concepts
    expect(screen.getByText('Đã kiểm')).toBeInTheDocument();
    expect(screen.getByText('Đạt chuẩn')).toBeInTheDocument();
    expect(screen.getByText('Lỗi/Từ chối')).toBeInTheDocument();
    expect(screen.getByText('Còn lại')).toBeInTheDocument();
  });
});
