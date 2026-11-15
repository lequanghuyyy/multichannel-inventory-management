import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReceiptDetailPage } from './ReceiptDetailPage';
import type { Receipt, ReceivePreviewResult, ReceiptAuditEntry, ReceiptRejection, ReceiptAttachment } from '../../api/receipts';

function createMockReceipt(): Receipt {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    receipt_number: 'REC-20261012-001',
    supplier_name: 'Nike Global',
    reference_number: 'INV-101',
    status: 'DRAFT',
    note: 'Check carefully',
    created_by_email: 'staff@example.test',
    cancelled_reason: '',
    closed_short_reason: '',
    created_at: '2026-10-12T08:00:00Z',
    updated_at: '2026-10-12T08:00:00Z',
    version: 1,
    item_count: 1,
    total_expected: 5,
    total_received: 0,
    total_inspected: 0,
    total_accepted: 0,
    total_rejected: 0,
    total_remaining: 5,
    items: [
      {
        id: 'item-1',
        receipt_id: '10000000-0000-4000-8000-000000000001',
        variant_id: 'v-1',
        sku: 'SHOE-001-BLK-42',
        product_name: 'Running Shoe 001',
        expected_quantity: 5,
        unit_cost_minor: 275000,
        received_quantity: 0,
        inspected_quantity: 0,
        accepted_quantity: 0,
        rejected_quantity: 0,
        remaining_quantity: 5,
        replaced_quantity: 0,
        short_quantity: 0,
        created_at: '2026-10-12T08:00:00Z',
      },
    ],
    events: [],
    rejections: [],
    attachments: [],
  };
}

function createMockPreviewResult(receiptId: string): ReceivePreviewResult {
  return {
    receipt_id: receiptId,
    receipt_number: 'REC-20261012-001',
    supplier_name: 'Nike Global',
    receipt_status: 'DRAFT',
    total_skus: 1,
    total_accepted: 5,
    total_rejected: 0,
    total_remaining_after: 0,
    valid: true,
    errors: [],
    items: [
      {
        sku: 'SHOE-001-BLK-42',
        product_name: 'Running Shoe 001',
        variant_id: 'v-1',
        expected_quantity: 5,
        received_quantity_before: 0,
        accepted_quantity: 5,
        rejected_quantity: 0,
        remaining_before: 5,
        remaining_after: 0,
        current_on_hand: 10,
        projected_on_hand: 15,
        inventory_version: 1,
        valid: true,
        errors: [],
      },
    ],
  };
}

const getReceiptMock = vi.fn();
const receiveReceiptMock = vi.fn();
const cancelReceiptMock = vi.fn();
const closeShortReceiptMock = vi.fn();
const previewReceiveReceiptMock = vi.fn();
const updateReceiptMock = vi.fn();
const listReceiptAuditMock = vi.fn();
const exportReceiptCsvMock = vi.fn();
const handleRejectionActionMock = vi.fn();
const uploadReceiptAttachmentMock = vi.fn();
const deleteReceiptAttachmentMock = vi.fn();

vi.mock('../../api/receipts', () => ({
  getReceipt: (...args: unknown[]) => getReceiptMock(...args),
  receiveReceipt: (...args: unknown[]) => receiveReceiptMock(...args),
  cancelReceipt: (...args: unknown[]) => cancelReceiptMock(...args),
  closeShortReceipt: (...args: unknown[]) => closeShortReceiptMock(...args),
  previewReceiveReceipt: (...args: unknown[]) => previewReceiveReceiptMock(...args),
  updateReceipt: (...args: unknown[]) => updateReceiptMock(...args),
  listReceiptAudit: (...args: unknown[]) => listReceiptAuditMock(...args),
  exportReceiptCsv: (...args: unknown[]) => exportReceiptCsvMock(...args),
  handleRejectionAction: (...args: unknown[]) => handleRejectionActionMock(...args),
  uploadReceiptAttachment: (...args: unknown[]) => uploadReceiptAttachmentMock(...args),
  deleteReceiptAttachment: (...args: unknown[]) => deleteReceiptAttachmentMock(...args),
  getAttachmentDownloadUrl: vi.fn((rId, aId) => `/api/v1/receipts/${rId}/attachments/${aId}`),
}));

vi.mock('../../api/inventory', () => ({
  listInventory: vi.fn().mockResolvedValue({ items: [], nextCursor: undefined }),
  getInventoryRowBySku: vi.fn().mockResolvedValue({ sku: 'SHOE-001-BLK-42', version: 1 }),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  listReceiptAuditMock.mockResolvedValue([]);
});

describe('ReceiptDetailPage', () => {
  it('renders receipt details, opens pre-receipt confirmation preview modal, and commits receive', async () => {
    const mockReceipt = createMockReceipt();
    getReceiptMock.mockResolvedValueOnce(mockReceipt);
    listReceiptAuditMock.mockResolvedValueOnce([]);
    previewReceiveReceiptMock.mockResolvedValueOnce(createMockPreviewResult(mockReceipt.id));
    receiveReceiptMock.mockResolvedValueOnce({
      ...mockReceipt,
      status: 'RECEIVED',
      total_received: 5,
      total_accepted: 5,
      total_inspected: 5,
      total_remaining: 0,
      items: [
        {
          ...mockReceipt.items[0],
          received_quantity: 5,
          inspected_quantity: 5,
          accepted_quantity: 5,
          remaining_quantity: 0,
        },
      ],
      events: [
        {
          id: 'ev-1',
          receipt_id: mockReceipt.id,
          batch_number: 1,
          actor_email: 'staff@example.test',
          note: 'Batch 1',
          created_at: '2026-10-12T09:00:00Z',
          items: [
            {
              id: 'evi-1',
              receipt_item_id: 'item-1',
              variant_id: 'v-1',
              sku: 'SHOE-001-BLK-42',
              accepted_quantity: 5,
              rejected_quantity: 0,
              rejection_reason: '',
              on_hand_before: 10,
              on_hand_after: 15,
            },
          ],
        },
      ],
    });

    render(<ReceiptDetailPage id={mockReceipt.id} />);

    await waitFor(() => {
      expect(screen.getAllByText('REC-20261012-001').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Nike Global').length).toBeGreaterThan(0);
    });

    // Check receive section is displayed
    expect(screen.getByText('Ghi nhận đợt nhận hàng thực tế')).toBeInTheDocument();

    const numberInputs = screen.getAllByRole('spinbutton');
    expect(numberInputs[0]).toBeDefined();
    fireEvent.change(numberInputs[0]!, { target: { value: '5' } });

    // Click preview button
    const previewBtn = screen.getByRole('button', { name: /Xem trước & Xác nhận nhận hàng/i });
    fireEvent.click(previewBtn);

    // Verify preview API called
    await waitFor(() => {
      expect(previewReceiveReceiptMock).toHaveBeenCalledWith(
        mockReceipt.id,
        expect.objectContaining({
          items: [
            expect.objectContaining({
              sku: 'SHOE-001-BLK-42',
              accepted_quantity: 5,
              rejected_quantity: 0,
            }),
          ],
        })
      );
    });

    // Modal opens showing preview data
    await waitFor(() => {
      expect(screen.getByText('Xác nhận nhận hàng vào kho')).toBeInTheDocument();
      expect(screen.getByText('+5 chiếc')).toBeInTheDocument();
      expect(screen.getAllByText('1 SKU').length).toBeGreaterThan(0);
    });

    // Modal shows projected stock update
    expect(screen.getByText(/10 →/)).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();

    // Confirm commit inside modal
    const commitBtn = screen.getByRole('button', { name: /Xác nhận nhập kho/i });
    fireEvent.click(commitBtn);

    await waitFor(() => {
      expect(receiveReceiptMock).toHaveBeenCalledWith(
        mockReceipt.id,
        expect.objectContaining({
          items: [
            expect.objectContaining({
              sku: 'SHOE-001-BLK-42',
              accepted_quantity: 5,
              rejected_quantity: 0,
              expected_inventory_version: 1,
            }),
          ],
        }),
        expect.any(String)
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Đã xác nhận nhận hàng và cập nhật tồn kho thành công/i)).toBeInTheDocument();
    });
  });

  it('allows cancelling a draft receipt with reason', async () => {
    const mockReceipt = createMockReceipt();
    getReceiptMock.mockResolvedValueOnce(mockReceipt);
    listReceiptAuditMock.mockResolvedValueOnce([]);
    cancelReceiptMock.mockResolvedValueOnce({
      ...mockReceipt,
      status: 'CANCELLED',
      cancelled_reason: 'Shipment lost',
    });

    render(<ReceiptDetailPage id={mockReceipt.id} />);

    await waitFor(() => {
      expect(screen.getAllByText('REC-20261012-001').length).toBeGreaterThan(0);
    });

    const cancelBtn = screen.getByRole('button', { name: 'Hủy phiếu' });
    fireEvent.click(cancelBtn);

    // Modal opens
    const reasonInput = screen.getByLabelText(/Lý do hủy \*/i);
    fireEvent.change(reasonInput, { target: { value: 'Shipment lost' } });

    const confirmCancelBtn = screen.getByRole('button', { name: 'Xác nhận hủy' });
    fireEvent.click(confirmCancelBtn);

    await waitFor(() => {
      expect(cancelReceiptMock).toHaveBeenCalledWith(
        mockReceipt.id,
        expect.objectContaining({ reason: 'Shipment lost' }),
        expect.any(String)
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Phiếu đã bị hủy/i)).toBeInTheDocument();
    });
  });

  it('keeps the same idempotency key on network retry until form inputs change', async () => {
    const mockReceipt = createMockReceipt();
    getReceiptMock.mockResolvedValueOnce(mockReceipt);
    listReceiptAuditMock.mockResolvedValueOnce([]);
    previewReceiveReceiptMock.mockResolvedValue(createMockPreviewResult(mockReceipt.id));
    receiveReceiptMock
      .mockRejectedValueOnce(new Error('Network connection dropped'))
      .mockResolvedValueOnce({
        ...mockReceipt,
        status: 'RECEIVED',
        total_received: 5,
        total_accepted: 5,
        total_remaining: 0,
        items: [
          {
            ...mockReceipt.items[0],
            received_quantity: 5,
            accepted_quantity: 5,
            remaining_quantity: 0,
          },
        ],
        events: [],
      });

    render(<ReceiptDetailPage id={mockReceipt.id} />);

    await waitFor(() => {
      expect(screen.getAllByText('REC-20261012-001').length).toBeGreaterThan(0);
    });

    const numberInputs = screen.getAllByRole('spinbutton');
    expect(numberInputs[0]).toBeDefined();
    fireEvent.change(numberInputs[0]!, { target: { value: '5' } });

    // Open preview
    const previewBtn = screen.getByRole('button', { name: /Xem trước & Xác nhận nhận hàng/i });
    fireEvent.click(previewBtn);

    await waitFor(() => {
      expect(screen.getByText('Xác nhận nhận hàng vào kho')).toBeInTheDocument();
    });

    const commitBtn = screen.getByRole('button', { name: /Xác nhận nhập kho/i });

    // First attempt: network error
    fireEvent.click(commitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Network connection dropped/i)).toBeInTheDocument();
    });

    const firstCall = receiveReceiptMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const firstKey = firstCall?.[2] as string;
    expect(firstKey).toBeTruthy();

    // Second attempt: retry without changing inputs
    fireEvent.click(commitBtn);

    await waitFor(() => {
      expect(receiveReceiptMock).toHaveBeenCalledTimes(2);
    });

    const secondCall = receiveReceiptMock.mock.calls[1];
    expect(secondCall).toBeDefined();
    const secondKey = secondCall?.[2] as string;
    expect(secondKey).toBe(firstKey); // MUST be identical key to avoid double-increment
  });

  it('handles stale inventory version conflict and offers re-preview', async () => {
    const mockReceipt = createMockReceipt();
    getReceiptMock.mockResolvedValueOnce(mockReceipt);
    listReceiptAuditMock.mockResolvedValueOnce([]);
    previewReceiveReceiptMock.mockResolvedValue(createMockPreviewResult(mockReceipt.id));
    receiveReceiptMock.mockRejectedValueOnce(
      new Error('STALE_INVENTORY: Tồn kho đã thay đổi so với bản xem trước')
    );

    render(<ReceiptDetailPage id={mockReceipt.id} />);

    await waitFor(() => {
      expect(screen.getAllByText('REC-20261012-001').length).toBeGreaterThan(0);
    });

    const numberInputs = screen.getAllByRole('spinbutton');
    fireEvent.change(numberInputs[0]!, { target: { value: '5' } });

    // Open preview
    fireEvent.click(screen.getByRole('button', { name: /Xem trước & Xác nhận nhận hàng/i }));

    await waitFor(() => {
      expect(screen.getByText('Xác nhận nhận hàng vào kho')).toBeInTheDocument();
    });

    // Commit receive triggers 409 stale inventory
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận nhập kho/i }));

    await waitFor(() => {
      expect(screen.getByText(/Tồn kho của một hoặc nhiều SKU đã thay đổi so với bản xem trước/i)).toBeInTheDocument();
    });

    // Re-preview button is shown
    const rePreviewBtn = screen.getByRole('button', { name: /Tải lại xem trước/i });
    expect(rePreviewBtn).toBeInTheDocument();
    fireEvent.click(rePreviewBtn);

    await waitFor(() => {
      expect(previewReceiveReceiptMock).toHaveBeenCalledTimes(2);
    });
  });

  it('allows editing a draft receipt with optimistic concurrency and preserves receipt number', async () => {
    const mockReceipt = createMockReceipt();
    getReceiptMock.mockResolvedValueOnce(mockReceipt);
    listReceiptAuditMock.mockResolvedValueOnce([]);
    updateReceiptMock.mockResolvedValueOnce({
      ...mockReceipt,
      supplier_name: 'Nike Vietnam',
      note: 'Updated delivery instructions',
      version: 2,
    });

    render(<ReceiptDetailPage id={mockReceipt.id} />);

    await waitFor(() => {
      expect(screen.getAllByText('REC-20261012-001').length).toBeGreaterThan(0);
    });

    // Click edit button
    const editBtn = screen.getByRole('button', { name: 'Chỉnh sửa phiếu' });
    fireEvent.click(editBtn);

    // Edit form appears
    expect(screen.getByText('Chỉnh sửa phiếu nhập (Bản nháp)')).toBeInTheDocument();
    // Receipt number is immutable
    expect(screen.getAllByText('REC-20261012-001').length).toBeGreaterThanOrEqual(1);

    // Change supplier name and note
    const supplierInput = screen.getByLabelText(/Nhà cung cấp \*/i);
    fireEvent.change(supplierInput, { target: { value: 'Nike Vietnam' } });

    const noteInput = screen.getByLabelText(/Ghi chú/i);
    fireEvent.change(noteInput, { target: { value: 'Updated delivery instructions' } });

    // Save changes
    const saveBtn = screen.getByRole('button', { name: /Lưu thay đổi/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(updateReceiptMock).toHaveBeenCalledWith(
        mockReceipt.id,
        expect.objectContaining({
          expected_version: 1,
          supplier_name: 'Nike Vietnam',
          note: 'Updated delivery instructions',
        }),
        expect.any(String)
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Cập nhật phiếu nhập nháp thành công/i)).toBeInTheDocument();
    });
  });

  it('displays audit history for draft modifications', async () => {
    const mockReceipt = createMockReceipt();
    const mockAudit: ReceiptAuditEntry[] = [
      {
        id: 'audit-1',
        receipt_id: mockReceipt.id,
        action: 'receipt_update',
        actor_email: 'supervisor@example.test',
        changes: {
          before: { supplier_name: 'Nike Global' },
          after: { supplier_name: 'Nike Vietnam' },
        },
        created_at: '2026-10-12T10:00:00Z',
      },
    ];

    getReceiptMock.mockResolvedValueOnce(mockReceipt);
    listReceiptAuditMock.mockResolvedValueOnce(mockAudit);

    render(<ReceiptDetailPage id={mockReceipt.id} />);

    await waitFor(() => {
      expect(screen.getAllByText('REC-20261012-001').length).toBeGreaterThan(0);
    });

    await waitFor(() => {
      expect(screen.getByText('Nhật ký chỉnh sửa bản nháp')).toBeInTheDocument();
      expect(screen.getByText(/1 lần chỉnh sửa/i)).toBeInTheDocument();
      expect(screen.getByText('supervisor@example.test')).toBeInTheDocument();
      expect(screen.getByText('receipt_update')).toBeInTheDocument();
      expect(screen.getByText('Nike Vietnam')).toBeInTheDocument();
    });
  });

  // Requirement 4: Close Short Workflow
  it('supports closing a partially received receipt short (CLOSED_SHORT) with reason and expected_version', async () => {
    const partialReceipt: Receipt = {
      ...createMockReceipt(),
      status: 'PARTIALLY_RECEIVED',
      total_received: 3,
      total_accepted: 3,
      total_remaining: 2,
      version: 2,
      items: [
        {
          ...createMockReceipt().items[0]!,
          received_quantity: 3,
          accepted_quantity: 3,
          remaining_quantity: 2,
        },
      ],
    };

    getReceiptMock.mockResolvedValueOnce(partialReceipt);
    listReceiptAuditMock.mockResolvedValueOnce([]);
    closeShortReceiptMock.mockResolvedValueOnce({
      ...partialReceipt,
      status: 'CLOSED_SHORT',
      closed_short_reason: 'Nhà cung cấp hết hàng đợt 2',
      closed_short_by_email: 'supervisor@example.test',
      closed_short_at: '2026-10-12T11:00:00Z',
      version: 3,
      items: [
        {
          ...partialReceipt.items[0]!,
          short_quantity: 2,
          remaining_quantity: 0,
        },
      ],
    });

    render(<ReceiptDetailPage id={partialReceipt.id} />);

    await waitFor(() => {
      expect(screen.getAllByText('REC-20261012-001').length).toBeGreaterThan(0);
    });

    // Close Short button is available for PARTIALLY_RECEIVED
    const closeShortBtn = screen.getByRole('button', { name: /Kết thúc sớm/i });
    expect(closeShortBtn).toBeInTheDocument();
    fireEvent.click(closeShortBtn);

    // Modal opens
    expect(screen.getByText('Kết thúc sớm phiếu nhập hàng (Close Short)')).toBeInTheDocument();

    const reasonInput = screen.getByLabelText(/Lý do kết thúc sớm \*/i);
    fireEvent.change(reasonInput, { target: { value: 'Nhà cung cấp hết hàng đợt 2' } });

    const confirmBtn = screen.getByRole('button', { name: 'Xác nhận kết thúc sớm' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(closeShortReceiptMock).toHaveBeenCalledWith(
        partialReceipt.id,
        {
          reason: 'Nhà cung cấp hết hàng đợt 2',
          expected_version: 2,
        },
        expect.any(String)
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Phiếu đã kết thúc sớm \(Closed Short\)/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Nhà cung cấp hết hàng đợt 2/i).length).toBeGreaterThan(0);
    });
  });

  // Requirement 6: Rejection and Replacement Action Workflow
  it('supports performing discrepancy resolution actions (rejections & replacements)', async () => {
    const mockRejection: ReceiptRejection = {
      id: 'rej-1',
      receipt_id: '10000000-0000-4000-8000-000000000001',
      receipt_item_id: 'item-1',
      event_id: 'ev-1',
      variant_id: 'v-1',
      sku: 'SHOE-001-BLK-42',
      product_name: 'Running Shoe 001',
      rejected_quantity: 2,
      rejection_reason: 'Rách bao bì và đế nứt',
      status: 'PENDING',
      replacement_requested_quantity: 0,
      replacement_accepted_quantity: 0,
      replacement_rejected_quantity: 0,
      returned_quantity: 0,
      closed_quantity: 0,
      unresolved_quantity: 2,
      created_by_user_id: 'u-1',
      created_by_email: 'staff@example.test',
      created_at: '2026-10-12T09:00:00Z',
      updated_at: '2026-10-12T09:00:00Z',
      actions: [],
    };

    const receiptWithRejection: Receipt = {
      ...createMockReceipt(),
      status: 'PARTIALLY_RECEIVED',
      rejections: [mockRejection],
    };

    getReceiptMock.mockResolvedValueOnce(receiptWithRejection);
    listReceiptAuditMock.mockResolvedValueOnce([]);
    handleRejectionActionMock.mockResolvedValueOnce({
      ...mockRejection,
      status: 'REPLACEMENT_REQUESTED',
      replacement_requested_quantity: 2,
      unresolved_quantity: 0,
      actions: [
        {
          id: 'act-1',
          rejection_id: 'rej-1',
          receipt_id: receiptWithRejection.id,
          action_type: 'REQUEST_REPLACEMENT',
          quantity: 2,
          accepted_quantity: 0,
          rejected_quantity: 0,
          rejection_reason: '',
          note: 'Yêu cầu đổi trả đợt mới',
          actor_user_id: 'u-1',
          actor_email: 'staff@example.test',
          created_at: '2026-10-12T10:00:00Z',
        },
      ],
    });
    // Subsequent reload
    getReceiptMock.mockResolvedValueOnce({
      ...receiptWithRejection,
      rejections: [
        {
          ...mockRejection,
          status: 'REPLACEMENT_REQUESTED',
          replacement_requested_quantity: 2,
          unresolved_quantity: 0,
        },
      ],
    });

    render(<ReceiptDetailPage id={receiptWithRejection.id} />);

    await waitFor(() => {
      expect(screen.getByText('Rách bao bì và đế nứt')).toBeInTheDocument();
    });

    const resolveBtn = screen.getByRole('button', { name: /Xử lý chênh lệch/i });
    fireEvent.click(resolveBtn);

    // Modal opens
    expect(screen.getByText('Xử lý chênh lệch hàng lỗi')).toBeInTheDocument();

    const noteInput = screen.getByLabelText(/Ghi chú xử lý/i);
    fireEvent.change(noteInput, { target: { value: 'Yêu cầu đổi trả đợt mới' } });

    const confirmActionBtn = screen.getByRole('button', { name: 'Xác nhận xử lý' });
    fireEvent.click(confirmActionBtn);

    await waitFor(() => {
      expect(handleRejectionActionMock).toHaveBeenCalledWith(
        receiptWithRejection.id,
        'rej-1',
        expect.objectContaining({
          action_type: 'REQUEST_REPLACEMENT',
          quantity: 2,
          note: 'Yêu cầu đổi trả đợt mới',
        }),
        expect.any(String)
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Đã cập nhật xử lý chênh lệch hàng lỗi thành công/i)).toBeInTheDocument();
    });
  });

  // Requirement 7: Export CSV & Print Layout
  it('triggers CSV download and window.print', async () => {
    const mockReceipt = createMockReceipt();
    getReceiptMock.mockResolvedValueOnce(mockReceipt);
    listReceiptAuditMock.mockResolvedValueOnce([]);

    const csvBlob = new Blob(['\uFEFFMã phiếu,Nhà cung cấp\nREC-20261012-001,Nike Global\n'], {
      type: 'text/csv;charset=utf-8;',
    });
    exportReceiptCsvMock.mockResolvedValueOnce(csvBlob);

    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    render(<ReceiptDetailPage id={mockReceipt.id} />);

    await waitFor(() => {
      expect(screen.getAllByText('REC-20261012-001').length).toBeGreaterThan(0);
    });

    // Test Print
    const printBtn = screen.getByRole('button', { name: /In phiếu/i });
    fireEvent.click(printBtn);
    expect(printSpy).toHaveBeenCalled();

    // Test Export CSV
    const exportBtn = screen.getByRole('button', { name: /Xuất CSV/i });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(exportReceiptCsvMock).toHaveBeenCalledWith(mockReceipt.id);
    });

    printSpy.mockRestore();
  });

  // Requirement 8: Document Attachments
  it('lists document attachments and supports uploading new file', async () => {
    const mockAttachment: ReceiptAttachment = {
      id: 'att-1',
      receipt_id: '10000000-0000-4000-8000-000000000001',
      file_name: 'bien-ban-giao-hang.pdf',
      mime_type: 'application/pdf',
      byte_size: 1048576,
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      description: 'Biên bản giao hàng có chữ ký thủ kho',
      uploaded_by_user_id: 'u-1',
      uploaded_by_email: 'staff@example.test',
      created_at: '2026-10-12T09:30:00Z',
    };

    const receiptWithAttachment: Receipt = {
      ...createMockReceipt(),
      attachments: [mockAttachment],
    };

    getReceiptMock.mockResolvedValueOnce(receiptWithAttachment);
    listReceiptAuditMock.mockResolvedValueOnce([]);
    uploadReceiptAttachmentMock.mockResolvedValueOnce({
      ...mockAttachment,
      id: 'att-2',
      file_name: 'hoa-don-vat.png',
    });
    getReceiptMock.mockResolvedValueOnce({
      ...receiptWithAttachment,
      attachments: [
        mockAttachment,
        {
          ...mockAttachment,
          id: 'att-2',
          file_name: 'hoa-don-vat.png',
          mime_type: 'image/png',
        },
      ],
    });

    render(<ReceiptDetailPage id={receiptWithAttachment.id} />);

    await waitFor(() => {
      expect(screen.getByText('bien-ban-giao-hang.pdf')).toBeInTheDocument();
      expect(screen.getByText(/1.00 MB/)).toBeInTheDocument();
    });

    const openUploadBtn = screen.getByRole('button', { name: /Tải lên tài liệu/i });
    fireEvent.click(openUploadBtn);

    // Modal opens
    expect(screen.getByText('Tải lên tài liệu chứng từ')).toBeInTheDocument();

    const descInput = screen.getByLabelText(/Mô tả tệp \(Tùy chọn\)/i);
    fireEvent.change(descInput, { target: { value: 'Hóa đơn VAT nhà cung cấp' } });

    // Select file
    const file = new File(['dummy-content'], 'hoa-don-vat.png', { type: 'image/png' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();
    fireEvent.change(fileInput, { target: { files: [file] } });

    const submitUploadBtn = screen.getByRole('button', { name: 'Tải lên' });
    fireEvent.click(submitUploadBtn);

    await waitFor(() => {
      expect(uploadReceiptAttachmentMock).toHaveBeenCalledWith(
        receiptWithAttachment.id,
        file,
        'Hóa đơn VAT nhà cung cấp'
      );
    });
  });
});
