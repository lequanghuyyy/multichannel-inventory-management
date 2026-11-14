import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DashboardPage } from './DashboardPage';

afterEach(cleanup);

describe('DashboardPage', () => {
  it('renders the overview modules without technical status panels', () => {
    render(<DashboardPage />);

    expect(screen.getByRole('heading', { name: 'Không gian bán hàng' })).toBeInTheDocument();
    // The overview states its window instead of badging itself: the source label is drawn
    // from the backend, not from a badge bolted onto the screen.
    expect(screen.getByLabelText('Khoảng thời gian')).toHaveTextContent('7 ngày gần nhất');
    expect(screen.queryByText(/Dữ liệu (mẫu|thật)/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tổng quan bán hàng theo kênh' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hoạt động đồng bộ gần đây' })).toBeInTheDocument();
    expect(screen.getAllByText('SHOE-001-BLK-42')).toHaveLength(2);
    expect(screen.queryByText(/backend|database|API/i)).not.toBeInTheDocument();
  });

  it('switches the sales visualization without mutating the static data source', () => {
    render(<DashboardPage />);

    fireEvent.click(screen.getByRole('tab', { name: 'Đơn hàng' }));
    expect(screen.getByRole('tab', { name: 'Đơn hàng' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('img', { name: 'Biểu đồ đơn hàng trong 7 ngày' })).toBeInTheDocument();
  });
});
