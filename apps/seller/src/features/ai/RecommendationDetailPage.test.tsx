import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RecommendationDetailPage } from './RecommendationDetailPage';

afterEach(() => cleanup());

describe('RecommendationDetailPage', () => {
  it('discloses score semantics, supplied comparisons and disabled policy actions', async () => {
    render(<RecommendationDetailPage id="40000000-0000-4000-8000-000000000001" mode="default" />);
    await waitFor(() => expect(screen.getByLabelText('Đề xuất SHOE-001-BLK-42')).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText('Điểm này chưa được hiệu chuẩn', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Có thể bán: 14 → 11 sản phẩm', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Áp dụng đề xuất' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Bỏ qua' })).toBeDisabled();
  });

  it('renders an explicit missing recommendation state', async () => {
    render(<RecommendationDetailPage id="missing" mode="default" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Không tìm thấy đề xuất' })).toBeInTheDocument());
  });
});
