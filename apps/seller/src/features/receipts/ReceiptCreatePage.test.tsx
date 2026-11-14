import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceiptCreatePage } from './ReceiptCreatePage';

const INTENT_STORAGE_KEY = 'datt_receipt_create_intent';

const createReceiptMock = vi.fn();
vi.mock('../../api/receipts', () => ({
  createReceipt: (...args: unknown[]) => createReceiptMock(...args),
}));

const listInventoryMock = vi.fn();
vi.mock('../../api/inventory', () => ({
  listInventory: (...args: unknown[]) => listInventoryMock(...args),
}));

beforeEach(() => {
  sessionStorage.clear();
  listInventoryMock.mockResolvedValue({
    items: [{ sku: 'SHOE-001-BLK-42', product_name: 'Running Shoe', color: 'Black', size: '42', on_hand: 10 }],
    nextCursor: undefined,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessionStorage.clear();
});

async function addSkuItem(sku: string, qty: number, unitCost?: number) {
  const skuInput = screen.getByLabelText(/Mã SKU/i);
  fireEvent.change(skuInput, { target: { value: sku } });

  const qtyInput = screen.getByLabelText(/Số lượng dự kiến/i);
  fireEvent.change(qtyInput, { target: { value: String(qty) } });

  if (unitCost !== undefined) {
    fireEvent.change(screen.getByLabelText(/Đơn giá nhập/i), { target: { value: String(unitCost) } });
  }

  const addBtn = screen.getByRole('button', { name: /Thêm SKU/i });
  await waitFor(() => expect(addBtn).not.toBeDisabled());
  fireEvent.click(addBtn);

  await waitFor(() => {
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
}

describe('ReceiptCreatePage', () => {
  it('validates required fields before submitting', async () => {
    render(<ReceiptCreatePage />);

    const submitBtn = screen.getByRole('button', { name: /Lưu phiếu nháp/i });
    expect(submitBtn).toBeDisabled(); // Disabled when items list is empty
  });

  it('allows adding SKUs and submits draft receipt', async () => {
    createReceiptMock.mockResolvedValueOnce({
      id: '10000000-0000-4000-8000-000000000001',
      receipt_number: 'REC-20261012-001',
      status: 'DRAFT',
    });

    render(<ReceiptCreatePage />);

    // Fill supplier name
    const supplierInput = screen.getByLabelText(/Tên nhà cung cấp/i);
    fireEvent.change(supplierInput, { target: { value: 'Supplier ABC' } });

    // Add SKU
    await addSkuItem('SHOE-001-BLK-42', 8, 125000);

    // Verify item is in table
    expect(screen.getByText('8')).toBeInTheDocument();

    // Submit form
    const submitBtn = screen.getByRole('button', { name: /Lưu phiếu nháp/i });
    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createReceiptMock).toHaveBeenCalledWith(
        expect.objectContaining({
          supplier_name: 'Supplier ABC',
          items: [{ sku: 'SHOE-001-BLK-42', expected_quantity: 8, unit_cost_minor: 125000 }],
        }),
        expect.any(String) // idempotencyKey
      );
    });
  });

  it('maintains the same idempotency key on network failure and retry without changing payload', async () => {
    createReceiptMock
      .mockRejectedValueOnce(new Error('Gateway timeout (504)'))
      .mockResolvedValueOnce({
        id: '10000000-0000-4000-8000-000000000001',
        receipt_number: 'REC-20261012-001',
        status: 'DRAFT',
      });

    render(<ReceiptCreatePage />);

    fireEvent.change(screen.getByLabelText(/Tên nhà cung cấp/i), { target: { value: 'Adidas Direct' } });
    await addSkuItem('SHOE-001-BLK-42', 10);

    const submitBtn = screen.getByRole('button', { name: /Lưu phiếu nháp/i });

    // First attempt fails with gateway timeout
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Gateway timeout/i);
    });

    const firstCallKey = createReceiptMock.mock.calls[0]?.[1] as string;
    expect(firstCallKey).toBeTruthy();

    // Verify sessionStorage persisted intent for reload recovery
    const saved = JSON.parse(sessionStorage.getItem(INTENT_STORAGE_KEY) || '{}');
    expect(saved.key).toBe(firstCallKey);

    // Second attempt without changing form inputs (retry)
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createReceiptMock).toHaveBeenCalledTimes(2);
    });

    const secondCallKey = createReceiptMock.mock.calls[1]?.[1] as string;
    expect(secondCallKey).toBe(firstCallKey); // MUST be identical key to prevent duplicate creation
  });

  it('generates a new idempotency key if payload changes after a failure', async () => {
    createReceiptMock
      .mockRejectedValueOnce(new Error('Internal server error'))
      .mockResolvedValueOnce({
        id: '10000000-0000-4000-8000-000000000001',
        receipt_number: 'REC-20261012-001',
        status: 'DRAFT',
      });

    render(<ReceiptCreatePage />);

    fireEvent.change(screen.getByLabelText(/Tên nhà cung cấp/i), { target: { value: 'Supplier X' } });
    await addSkuItem('SHOE-001-BLK-42', 5);

    const submitBtn = screen.getByRole('button', { name: /Lưu phiếu nháp/i });

    // First attempt fails
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Internal server error/i);
    });

    const firstKey = createReceiptMock.mock.calls[0]?.[1] as string;

    // Modify supplier name (payload fingerprint changes)
    fireEvent.change(screen.getByLabelText(/Tên nhà cung cấp/i), { target: { value: 'Supplier Y Changed' } });

    // Submit modified draft
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createReceiptMock).toHaveBeenCalledTimes(2);
    });

    const secondKey = createReceiptMock.mock.calls[1]?.[1] as string;
    expect(secondKey).not.toBe(firstKey); // New key generated because payload intent changed
  });

  it('recovers unconfirmed create intent and items from sessionStorage on page reload', async () => {
    const recoveredKey = 'recovered-idempotency-uuid-1234';
    const draftPayload = {
      supplier_name: 'Recovered Supplier Co',
      reference_number: 'REF-REC-99',
      receipt_number: '',
      note: 'Draft in flight before browser restart',
      items: [{ sku: 'SHOE-001-BLK-42', expected_quantity: 12, unit_cost_minor: 300000 }],
    };

    const fingerprint = JSON.stringify({
      supplier_name: draftPayload.supplier_name,
      reference_number: draftPayload.reference_number,
      receipt_number: '',
      note: draftPayload.note,
      items: draftPayload.items.map((it) => ({
        sku: it.sku,
        expected_quantity: it.expected_quantity,
        unit_cost_minor: it.unit_cost_minor,
      })),
    });

    sessionStorage.setItem(
      INTENT_STORAGE_KEY,
      JSON.stringify({
        key: recoveredKey,
        fingerprint,
        formDraft: {
          supplierName: draftPayload.supplier_name,
          referenceNumber: draftPayload.reference_number,
          receiptNumber: '',
          note: draftPayload.note,
          items: [
            {
              sku: 'SHOE-001-BLK-42',
              expected_quantity: 12,
              unit_cost_minor: 300000,
              productName: 'Running Shoe 001',
            },
          ],
        },
        timestamp: Date.now(),
      })
    );

    createReceiptMock.mockResolvedValueOnce({
      id: '10000000-0000-4000-8000-000000000099',
      receipt_number: 'REC-20261012-099',
      status: 'DRAFT',
    });

    render(<ReceiptCreatePage />);

    // Verify recovery banner is shown
    expect(screen.getByRole('status')).toHaveTextContent(/Khôi phục phiên tạo phiếu/i);

    // Verify form fields restored
    const supplierInput = screen.getByLabelText(/Tên nhà cung cấp/i) as HTMLInputElement;
    expect(supplierInput.value).toBe('Recovered Supplier Co');

    // Verify item table restored
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();

    // Submitting uses the recovered idempotency key
    const submitBtn = screen.getByRole('button', { name: /Lưu phiếu nháp/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createReceiptMock).toHaveBeenCalledWith(
        expect.objectContaining({
          supplier_name: 'Recovered Supplier Co',
          reference_number: 'REF-REC-99',
          items: [{ sku: 'SHOE-001-BLK-42', expected_quantity: 12, unit_cost_minor: 300000 }],
        }),
        recoveredKey
      );
    });

    // Successful submit clears storage
    await waitFor(() => {
      expect(sessionStorage.getItem(INTENT_STORAGE_KEY)).toBeNull();
    });
  });

  it('clears recovered session draft when "Làm mới phiên" is clicked', async () => {
    sessionStorage.setItem(
      INTENT_STORAGE_KEY,
      JSON.stringify({
        key: 'old-key',
        fingerprint: 'old-fp',
        formDraft: {
          supplierName: 'Old Supplier',
          items: [{ sku: 'SHOE-001-BLK-42', expected_quantity: 5 }],
        },
      })
    );

    render(<ReceiptCreatePage />);

    expect(screen.getByRole('status')).toHaveTextContent(/Khôi phục phiên tạo phiếu/i);
    const resetSessionBtn = screen.getByRole('button', { name: /Làm mới phiên/i });
    fireEvent.click(resetSessionBtn);

    expect(sessionStorage.getItem(INTENT_STORAGE_KEY)).toBeNull();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    const supplierInput = screen.getByLabelText(/Tên nhà cung cấp/i) as HTMLInputElement;
    expect(supplierInput.value).toBe('');
  });
});
