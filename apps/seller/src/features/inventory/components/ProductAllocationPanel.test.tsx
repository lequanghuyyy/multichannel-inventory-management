import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../../core/api-error';
import type { AllocationExecution, AllocationPlanItem, AllocationPlanPreview } from '../../../api/allocations';
import type { ProductInventoryRow } from '../../../api/channel-operations';
import type { Channel } from '../../../api/channels';
import type { ProductApiDetail } from '../../products/product.detail.api';
import { ProductAllocationPanel } from './ProductAllocationPanel';

const { previewAllocation, executeAllocation, getAllocationExecution, useProductChannelAllocations, usePOSAllocation } = vi.hoisted(() => ({
  previewAllocation: vi.fn(),
  executeAllocation: vi.fn(),
  getAllocationExecution: vi.fn(),
  useProductChannelAllocations: vi.fn(),
  usePOSAllocation: vi.fn(),
}));

vi.mock('../../../api/allocations', () => ({ previewAllocation, executeAllocation, getAllocationExecution }));
vi.mock('../hooks/useProductChannelAllocations', () => ({ useProductChannelAllocations }));
vi.mock('../hooks/usePOSAllocation', () => ({ usePOSAllocation }));

const product: ProductApiDetail = {
  id: '10000000-0000-4000-8000-000000000001',
  productVersion: 7,
  name: 'Running Shoe 001',
  category: 'FOOTWEAR',
  brand: 'Vantage',
  description: '',
  shortDescription: '',
  attributes: {},
  weightGrams: 850,
  lengthMM: null,
  widthMM: null,
  heightMM: null,
  condition: 'new',
  masterSku: 'MSKU-RUN-4819',
  currency: 'VND',
  status: 'active',
  variantCount: 1,
  onHand: 10,
  reserved: 2,
  safetyBuffer: 1,
  availableToSell: 7,
  variants: [{
    id: 'v-1',
    sku: 'SHOE-001-BLK-41',
    color: 'BLACK',
    colorDescription: '',
    size: '41',
    priceMinor: 990000,
    barcode: '',
    isActive: true,
    variantIsActive: true,
    onHand: 10,
    reserved: 2,
    safetyBuffer: 1,
    availableToSell: 7,
  }],
};

const channel: Channel = {
  id: '30000000-0000-4000-8000-000000000001',
  code: 'shopify',
  name: 'Shopify Dev Store',
  type: 'marketplace',
  environment: 'sandbox',
  status: 'connected',
  mapping_count: 1,
};

function inventoryRow(overrides: Partial<ProductInventoryRow> = {}): ProductInventoryRow {
  return {
    listing_id: '60000000-0000-4000-8000-000000000001',
    sku: 'SHOE-001-BLK-41',
    has_balance: true,
    on_hand: 10,
    reserved: 2,
    safety_buffer: 1,
    available_to_sell: 7,
    channel_code: 'shopify',
    channel_name: 'Shopify Dev Store',
    shop_name: 'OctoFlow Sandbox',
    channel_status: 'connected',
    mapping_status: 'verified',
    listed: true,
    allocation_state: 'participating',
    inventory_tracking_enabled: true,
    target_quantity: 5,
    preview_quantity: null,
    preview_delta: null,
    target_version: 7,
    target_allocation_revision: 1,
    current_allocation_revision: 1,
    allocation_core_version: 7,
    core_version: 7,
    reported_quantity: 5,
    has_baseline: true,
    write_enabled: true,
    ready: true,
    latest_sync_status: 'VERIFIED',
    latest_sync_verified_at: '2026-11-08T04:00:00Z',
    ...overrides,
  };
}

function planItem(overrides: Partial<AllocationPlanItem> = {}): AllocationPlanItem {
  return {
    listing_id: '60000000-0000-4000-8000-000000000001',
    channel_id: channel.id,
    channel_code: 'shopify',
    external_sku: 'SHOE-001-BLK-41',
    current_allocation_state: 'participating',
    planned_state: 'continuing',
    currently_participating: true,
    will_participate: true,
    platform_product_exists: true,
    published: true,
    publication_state: 'published',
    inventory_tracking_ready: true,
    inventory_write_enabled: true,
    mapping_verified: true,
    ready_to_sell: true,
    current_target_quantity: 5,
    target_allocation_revision: 1,
    reported_quantity: 5,
    reported_at: new Date().toISOString(),
    proposed_quantity: 3,
    delta: -2,
    delta_basis: 'target',
    change: 'decrease',
    can_execute: true,
    issues: [],
    ...overrides,
  };
}

function preview(overrides: Partial<AllocationPlanPreview> = {}): AllocationPlanPreview {
  return {
    id: '50000000-0000-4000-8000-000000000001',
    variant_id: 'v-1',
    sku: 'SHOE-001-BLK-41',
    available_to_sell: 7,
    core_version: 7,
    base_allocation_revision: 1,
    allocation_revision: 2,
    policy: { type: 'equal', weights: {} },
    status: 'projected',
    can_execute: true,
    issues: [],
    items: [planItem()],
    created_at: '2026-11-08T04:00:00Z',
    ...overrides,
  };
}

const applyingExecution: AllocationExecution = {
  plan_id: '50000000-0000-4000-8000-000000000001',
  variant_id: 'v-1',
  core_version: 7,
  base_allocation_revision: 1,
  allocation_revision: 2,
  status: 'applying',
  phase: 'decreasing',
  can_execute: true,
  created_at: '2026-11-08T04:00:00Z',
  started_at: '2026-11-08T04:00:01Z',
  steps: [{
    id: 'step-1',
    listing_id: '60000000-0000-4000-8000-000000000001',
    channel_code: 'shopify',
    direction: 'decrease',
    status: 'in_progress',
    before_quantity: 5,
    target_quantity: 3,
    observed_quantity: 5,
    attempt_count: 1,
    evidence: null,
  }],
};

const stableRefresh = vi.fn();
const posSnapshot = {
  pos_mode: 'shared' as const,
  desired_pos_mode: 'shared' as const,
  desired_pos_quota: 0,
  active_pos_quota: 0,
  pos_remaining: 0,
  pos_revision: 1,
  pos_transition_state: 'stable' as const,
  pos_sellable: 7,
  online_budget: 7,
};

function mockLoaded(row: ProductInventoryRow = inventoryRow()) {
  useProductChannelAllocations.mockReturnValue({
    entries: [{ channel, rows: [row] }],
    error: null,
    loading: false,
    refreshing: false,
    refresh: stableRefresh,
  });
}

beforeEach(() => {
  previewAllocation.mockReset();
  executeAllocation.mockReset();
  getAllocationExecution.mockReset();
  useProductChannelAllocations.mockReset();
  usePOSAllocation.mockReset();
  usePOSAllocation.mockReturnValue({ snapshot: posSnapshot, loading: false, error: null, refresh: stableRefresh });
  stableRefresh.mockReset();
  mockLoaded();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ProductAllocationPanel', () => {
  it('previews without writing and only executes after the confirmation dialog', async () => {
    previewAllocation.mockResolvedValue(preview());
    executeAllocation.mockResolvedValue(applyingExecution);
    render(<ProductAllocationPanel product={product} canExecute />);

    fireEvent.click(screen.getByRole('button', { name: 'Xem trước phân bổ' }));

    await waitFor(() => expect(previewAllocation).toHaveBeenCalledWith({
      variant_id: 'v-1',
      listing_ids: ['60000000-0000-4000-8000-000000000001'],
      pos_revision: 1,
      desired_pos_mode: 'shared',
      desired_pos_quota: 0,
    }));
    const previewCard = await screen.findByLabelText('Kết quả xem trước phân bổ');
    expect(previewCard).toHaveTextContent('Tổng thu hồi');
    expect(previewCard).toHaveTextContent('2');
    expect(executeAllocation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận áp dụng SHOE-001-BLK-41' }));
    const dialog = await screen.findByRole('dialog', { name: 'Áp dụng kế hoạch phân bổ?' });
    expect(executeAllocation).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận áp dụng' }));
    await waitFor(() => expect(executeAllocation).toHaveBeenCalledWith('50000000-0000-4000-8000-000000000001'));

    // A queued/applying server job is not completion. The panel keeps the last verified step
    // state on screen until the backend reports `completed`.
    const progress = await screen.findByLabelText('Tiến trình phân bổ');
    expect(progress).toHaveTextContent('Đang áp dụng');
    expect(progress).toHaveTextContent('Máy chủ vẫn đang áp dụng và xác minh từng kênh.');
    expect(progress).not.toHaveTextContent('Máy chủ đã xác minh tất cả bước');
  });

  it('opens the blockers dialog but keeps confirmation disabled', async () => {
    previewAllocation.mockResolvedValue(preview({
      can_execute: false,
      issues: ['CHANNEL_UNAVAILABLE'],
      items: [planItem({ can_execute: false, issues: ['MAPPING_INVALID'] })],
    }));
    render(<ProductAllocationPanel product={product} canExecute />);

    fireEvent.click(screen.getByRole('button', { name: 'Xem trước phân bổ' }));
    const previewCard = await screen.findByLabelText('Kết quả xem trước phân bổ');
    expect(within(previewCard).getByRole('heading', { name: 'Điểm chặn' })).toBeInTheDocument();
    expect(within(previewCard).getByRole('heading', { name: 'Kênh cần xử lý' })).toBeInTheDocument();

    fireEvent.click(within(previewCard).getByRole('button', { name: 'Xác nhận áp dụng' }));
    const dialog = await screen.findByRole('dialog', { name: 'Áp dụng kế hoạch phân bổ?' });
    expect(within(dialog).getByText('Kết nối kênh chưa sẵn sàng.')).toBeInTheDocument();
    expect(within(dialog).getByText('Listing chưa có mapping hợp lệ và đã xác minh.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Xác nhận áp dụng' })).toBeDisabled();
    expect(executeAllocation).not.toHaveBeenCalled();
  });

  it('sends the chosen weights, or an empty map for equal shares, and never a quantity', async () => {
    previewAllocation.mockResolvedValue(preview());
    render(<ProductAllocationPanel product={product} canExecute />);

    fireEvent.click(screen.getByRole('radio', { name: /Theo trọng số/ }));
    fireEvent.change(await screen.findByLabelText('Trọng số Shopify'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước phân bổ' }));

    await waitFor(() => expect(previewAllocation).toHaveBeenLastCalledWith({
      variant_id: 'v-1',
      listing_ids: ['60000000-0000-4000-8000-000000000001'],
      weights: { shopify: 3 },
      pos_revision: 1,
      desired_pos_mode: 'shared',
      desired_pos_quota: 0,
    }));

    fireEvent.click(screen.getByRole('radio', { name: /Chia đều/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước phân bổ' }));

    await waitFor(() => expect(previewAllocation).toHaveBeenLastCalledWith({
      variant_id: 'v-1',
      listing_ids: ['60000000-0000-4000-8000-000000000001'],
      weights: {},
      pos_revision: 1,
      desired_pos_mode: 'shared',
      desired_pos_quota: 0,
    }));
    expect(previewAllocation.mock.calls.every(([input]) => !('quantities' in input) && !('items' in input))).toBe(true);
  });

  it('previews a Dedicated POS target with the current revision without granting it immediately', async () => {
    previewAllocation.mockResolvedValue(preview({
      desired_pos_mode: 'dedicated',
      desired_pos_quota: 4,
      planned_pos_transition_state: 'pending',
      planned_pos_remaining: 4,
      online_budget: 3,
      unallocated: 0,
    }));
    render(<ProductAllocationPanel product={product} canExecute />);

    fireEvent.change(screen.getByLabelText('Chế độ tồn POS mong muốn'), { target: { value: 'dedicated' } });
    fireEvent.change(screen.getByLabelText('Quota POS mong muốn'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước phân bổ' }));

    const previewCard = await screen.findByLabelText('Kết quả xem trước phân bổ');
    await waitFor(() => expect(previewAllocation).toHaveBeenCalledWith(expect.objectContaining({
      pos_revision: 1,
      desired_pos_mode: 'dedicated',
      desired_pos_quota: 4,
    })));
    expect(previewCard).toHaveTextContent('POS quota mới chỉ có hiệu lực sau khi plan hoàn tất');
    expect(previewCard).toHaveTextContent('POS remaining hiện tại0');
    expect(previewCard).toHaveTextContent('POS quota sau xác minh4');
    expect(executeAllocation).not.toHaveBeenCalled();
  });

  it('locks recalculation while a joining allocation plan is actively applying', async () => {
    mockLoaded(inventoryRow({ allocation_state: 'joining', allocation_plan_status: 'applying' }));
    render(<ProductAllocationPanel product={product} canExecute />);

    expect(await screen.findByText(/kế hoạch phân bổ đang được xử lý/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xem trước phân bổ' })).toBeDisabled();
    expect(previewAllocation).not.toHaveBeenCalled();
  });

  it('restores an applying plan from server state after the page reloads', async () => {
    mockLoaded(inventoryRow({
      allocation_state: 'joining',
      allocation_plan_status: 'applying',
      allocation_plan_id: applyingExecution.plan_id,
    }));
    getAllocationExecution.mockResolvedValue(applyingExecution);
    render(<ProductAllocationPanel product={product} canExecute />);

    expect(await screen.findByLabelText('Tiến trình phân bổ')).toHaveTextContent('Đang áp dụng');
    expect(getAllocationExecution).toHaveBeenCalledWith(applyingExecution.plan_id);
    expect(executeAllocation).not.toHaveBeenCalled();
  });

  it('lets the seller create a new preview when a joining plan has stopped', async () => {
    previewAllocation.mockResolvedValue(preview());
    mockLoaded(inventoryRow({
      allocation_state: 'joining',
      allocation_plan_status: 'blocked',
      allocation_plan_error: 'CHANNEL_REFUSED: Shopify upward inventory write is blocked until a verified remote quantity baseline exists',
    }));
    render(<ProductAllocationPanel product={product} canExecute />);

    expect(await screen.findByText(/Kế hoạch trước đã bị chặn/)).toBeInTheDocument();
    expect(screen.getByText(/Chưa có mốc tồn Shopify đã xác minh/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Chia đều/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước phân bổ' }));

    await waitFor(() => expect(previewAllocation).toHaveBeenCalledWith({
      variant_id: 'v-1',
      listing_ids: ['60000000-0000-4000-8000-000000000001'],
      pos_revision: 1,
      desired_pos_mode: 'shared',
      desired_pos_quota: 0,
    }));
  });

  it('shows one plan error when multiple joining channels share a paused allocation', async () => {
    const error = 'CHANNEL_SUPERSEDED: lazada: Lazada mapping or Core allocation changed before inventory delivery';
    useProductChannelAllocations.mockReturnValue({
      entries: [
        { channel: { ...channel, code: 'lazada', name: 'Lazada VN' }, rows: [inventoryRow({
          listing_id: '60000000-0000-4000-8000-000000000002', channel_code: 'lazada', channel_name: 'Lazada VN',
          allocation_state: 'joining', allocation_plan_status: 'paused', allocation_plan_id: 'plan-1', allocation_plan_error: error,
        })] },
        { channel: { ...channel, id: '30000000-0000-4000-8000-000000000002', code: 'woocommerce', name: 'WooCommerce' }, rows: [inventoryRow({
          listing_id: '60000000-0000-4000-8000-000000000003', channel_code: 'woocommerce', channel_name: 'WooCommerce',
          allocation_state: 'joining', allocation_plan_status: 'paused', allocation_plan_id: 'plan-1', allocation_plan_error: error,
        })] },
      ],
      error: null, loading: false, refreshing: false, refresh: stableRefresh,
    });
    render(<ProductAllocationPanel product={product} canExecute />);

    const notice = (await screen.findByText(/Kế hoạch trước đã tạm dừng/)).closest('[role="status"]');
    expect(notice).not.toBeNull();
    expect(within(notice as HTMLElement).getAllByRole('listitem')).toHaveLength(1);
    expect(within(notice as HTMLElement).getByText(/Kế hoạch SKU SHOE-001-BLK-41/)).toBeInTheDocument();
    expect(within(notice as HTMLElement).getByText(/Hãy xem trước lại để tạo kế hoạch/)).toBeInTheDocument();
  });

  it('shows the server refusal when quota would exceed Core ATS', async () => {
    previewAllocation.mockRejectedValue(new ApiRequestError({
      code: 'QUOTA_EXCEEDS_ATS',
      message: 'Quota exceeds available to sell',
      request_id: 'req-allocation-1',
    }, 409));
    render(<ProductAllocationPanel product={product} canExecute />);

    fireEvent.click(screen.getByRole('button', { name: 'Xem trước phân bổ' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Tổng quota listing vượt ngân sách online sau khi dành quota POS.');
    expect(executeAllocation).not.toHaveBeenCalled();
  });
});
