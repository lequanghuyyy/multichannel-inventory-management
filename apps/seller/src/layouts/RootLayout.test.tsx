import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RootLayout } from './RootLayout';

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

describe('RootLayout', () => {
  it('keeps desktop and mobile navigation accessible from shared route data', () => {
    render(<RootLayout route={{ name: 'dashboard' }}><h1>Nội dung</h1></RootLayout>);

    const sidebar = screen.getByRole('complementary', { name: 'Điều hướng chính' });
    expect(within(sidebar).getByRole('button', { name: 'Tổng quan' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Sản phẩm' }));
    expect(window.location.pathname).toBe('/products');

    const mobileNavigation = screen.getByRole('navigation', { name: 'Điều hướng nhanh' });
    fireEvent.click(within(mobileNavigation).getByRole('button', { name: 'Thêm' }));
    expect(within(mobileNavigation).getByRole('menuitem', { name: 'Bán tại quầy' })).toBeInTheDocument();
    expect(within(mobileNavigation).getByRole('menuitem', { name: 'Kênh bán' })).toBeInTheDocument();
    expect(within(mobileNavigation).getByRole('menuitem', { name: 'Đồng bộ' })).toBeInTheDocument();
    expect(within(mobileNavigation).getByRole('menuitem', { name: 'Báo cáo' })).toBeInTheDocument();
    expect(within(mobileNavigation).getByRole('menuitem', { name: 'Cài đặt' })).toBeInTheDocument();
  });
});
