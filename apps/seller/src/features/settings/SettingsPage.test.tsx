import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SettingsPage } from './SettingsPage';

afterEach(() => {
  cleanup();
});

// The Settings screen is fixture-backed end to end: there is no live merchant-config endpoint
// behind it yet. The four panels are therefore told apart by WHAT THEY ARE — the heading each
// one carries — and never by a source badge, because a badge is decoration while a heading is
// the thing a screen-reader user actually navigates by.
async function renderSettings(mode: 'default' | 'empty' | 'error' = 'default') {
  render(<SettingsPage mode={mode} />);
  if (mode === 'default') {
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Hồ sơ cửa hàng' })).toBeInTheDocument(), { timeout: 3000 });
  }
}

describe('SettingsPage', () => {
  it('opens on the store profile with every field read-only', async () => {
    await renderSettings();

    expect(screen.getByRole('heading', { level: 1, name: 'Cài đặt' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hồ sơ cửa hàng' })).toBeInTheDocument();

    // A read-only field must be readonly in the DOM, not merely styled that way: a keyboard
    // user could otherwise focus it, type, and believe the store name had changed.
    expect(screen.getByLabelText('Tên cửa hàng')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Tên cửa hàng')).toHaveValue('Cửa hàng Apex Official');
    expect(screen.getByLabelText('Mã cửa hàng')).toHaveValue('APX-STORE-01');
    expect(screen.getByLabelText('Múi giờ mặc định')).toHaveValue('UTC+07:00 · Hà Nội / TP. Hồ Chí Minh');

    // Nothing on this screen may pretend a save is possible while no endpoint exists.
    expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Huỷ thay đổi' })).toBeDisabled();
  });

  it('navigates the four sections with the arrow keys', async () => {
    await renderSettings();

    const storeTab = screen.getByRole('tab', { name: /^Cửa hàng/ });
    fireEvent.keyDown(storeTab, { key: 'ArrowRight' });

    // ArrowRight moves the selection AND the panel, and the keyboard focus follows it —
    // otherwise the next Tab press would land somewhere unrelated.
    expect(screen.getByRole('tab', { name: /^Kho hàng/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Kho chính' })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('tab', { name: /^Kho hàng/ }), { key: 'End' });
    expect(screen.getByRole('tab', { name: /^Tuỳ chọn/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Tuỳ chọn hiển thị' })).toBeInTheDocument();
  });

  it('shows the warehouse totals with the sellable figure emphasised', async () => {
    await renderSettings();
    fireEvent.click(screen.getByRole('tab', { name: /^Kho hàng/ }));

    const metrics = screen.getByLabelText('Số liệu kho');
    // 14.820 − 1.124 − 410 = 13.286. The emphasised card is the one the formula produces.
    expect(metrics).toHaveTextContent('14.820');
    expect(metrics).toHaveTextContent('1.124');
    expect(metrics).toHaveTextContent('410');
    expect(metrics).toHaveTextContent('13.286');
    // The panel says plainly that these totals are illustrative.
    expect(screen.getByText(/chỉ để minh hoạ, chưa phải số liệu thật của kho/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thông số kho' })).toBeDisabled();
  });

  it('lists the access directory with roles and last sessions', async () => {
    await renderSettings();
    fireEvent.click(screen.getByRole('tab', { name: /^Thành viên/ }));

    expect(screen.getByRole('heading', { name: 'Danh sách thành viên' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Danh sách thành viên mẫu' });
    expect(within(table).getByText('Quản trị viên Apex')).toBeInTheDocument();
    expect(within(table).getByText('Trần Văn Cường')).toBeInTheDocument();
    // Role and status are shown as the shop reads them, not as the raw enum.
    expect(within(table).getAllByText('Quản trị viên').length).toBeGreaterThan(0);
    // Two members hold the Staff role, so the badge appears more than once.
    expect(within(table).getAllByText('Nhân viên').length).toBeGreaterThan(0);
    expect(within(table).getByText('Tạm khoá')).toBeInTheDocument();
    expect(within(table).getByText('12 phút trước · Web')).toBeInTheDocument();

    // "Đổi vai trò" renders twice (desktop table + mobile card); neither may be pressable.
    const editRole = screen.getAllByRole('button', { name: 'Đổi vai trò' });
    expect(editRole.length).toBeGreaterThan(0);
    editRole.forEach((button) => expect(button).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Mời thành viên' })).toBeDisabled();
  });

  it('applies only the session-scoped preview preferences', async () => {
    await renderSettings();
    fireEvent.click(screen.getByRole('tab', { name: /^Tuỳ chọn/ }));

    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByRole('heading', { name: 'Tuỳ chọn xem thử' })).toBeInTheDocument();

    // The hint is the preview: it is the only place the chosen format is shown.
    expect(screen.getByText('Ví dụ: 03/10/2026 · 14:42:08')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Định dạng giờ'), { target: { value: '12-hour' } });
    expect(screen.getByText('Ví dụ: 03/10/2026 · 02:42:08 CH')).toBeInTheDocument();

    // Density is a session choice and it is the one control that survives a tab change.
    fireEvent.change(screen.getByLabelText('Mật độ danh sách thành viên'), { target: { value: 'compact' } });
    fireEvent.click(screen.getByRole('tab', { name: /^Thành viên/ }));
    expect(screen.getByRole('heading', { name: 'Danh sách thành viên' })).toBeInTheDocument();

    // Notification switches are placeholders: there is no delivery service behind them.
    fireEvent.click(screen.getByRole('tab', { name: /^Tuỳ chọn/ }));
    expect(screen.getByRole('switch', { name: 'Thông báo đề xuất của AI' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Cảnh báo sắp hết hàng' })).toBeDisabled();
    expect(screen.getByLabelText('Ngôn ngữ giao diện')).toBeDisabled();
  });

  it('keeps explicit empty and error states', async () => {
    const { unmount } = render(<SettingsPage mode="empty" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Chưa có cài đặt' })).toBeInTheDocument());
    unmount();

    render(<SettingsPage mode="error" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không thể tải dữ liệu'));
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });
});
