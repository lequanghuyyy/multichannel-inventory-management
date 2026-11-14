import { useEffect } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductApiDetail } from '../product.detail.api';
import { LazadaProductDetailPanel } from './LazadaProductDetailPanel';

const api = vi.hoisted(() => ({ getLazadaStatus: vi.fn(), submit: vi.fn() }));
vi.mock('../../../api/lazada', () => ({ getLazadaStatus: api.getLazadaStatus }));
vi.mock('../../channels/components/LazadaPublicationPanel', () => ({
  LazadaPublicationPanel: ({ onStartPublish, refreshToken }: { onStartPublish: () => void; refreshToken: number }) => <div>
    <button type="button" onClick={onStartPublish}>Thiết lập đăng Lazada</button>
    <span data-testid="publication-refresh">{refreshToken}</span>
  </div>,
}));
vi.mock('../../channels/components/LazadaProductPreflightPanel', () => ({
  LazadaProductPreflightPanel: ({ onReadinessChange, onSubmitReady, onQueued }: {
    onReadinessChange: (ready: boolean) => void;
    onSubmitReady: (submit: () => Promise<void>) => void;
    onQueued: () => void;
  }) => {
    useEffect(() => { onSubmitReady(async () => { api.submit(); onQueued(); }); }, [onQueued, onSubmitReady]);
    return <button type="button" onClick={() => onReadinessChange(true)}>Kiểm tra điều kiện Lazada mẫu</button>;
  },
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('LazadaProductDetailPanel', () => {
  it('opens setup over the product page and confirms only after preflight', async () => {
    api.getLazadaStatus.mockResolvedValue({ enabled: true, configured: true, product_write_enabled: true, connection: { channel_id: 'channel-1', status: 'connected' } });
    const product = { id: 'product-1', name: 'Áo thun', currency: 'VND' } as ProductApiDetail;
    render(<LazadaProductDetailPanel product={product} canWrite />);

    fireEvent.click(await screen.findByRole('button', { name: 'Thiết lập đăng Lazada' }));
    expect(screen.getByRole('dialog', { name: 'Thông tin riêng cho Lazada' })).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Xác nhận đăng Lazada' });
    expect(confirm).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra điều kiện Lazada mẫu' }));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(api.submit).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Thông tin riêng cho Lazada' })).not.toBeInTheDocument());
    expect(screen.getByTestId('publication-refresh')).toHaveTextContent('1');
  });
});
