import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LazadaCategoryPanel } from './LazadaCategoryPanel';

const api = vi.hoisted(() => ({ categories: vi.fn(), attributes: vi.fn() }));
vi.mock('../../../api/lazada', () => ({
  getLazadaCategories: api.categories,
  getLazadaCategoryAttributes: api.attributes,
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('LazadaCategoryPanel', () => {
  it('suggests only fashion leaves from the live tree for a fashion product', async () => {
    api.categories.mockResolvedValue({ data: [
      { category_id: 10, name: 'Quần áo nữ', leaf: false, children: [{ category_id: 11, name: 'Quần dài', leaf: true }] },
      { category_id: 20, name: 'Điện tử', leaf: false, children: [{ category_id: 21, name: 'Điện thoại', leaf: true }] },
      { category_id: 30, name: 'Thiết bị thể thao & hoạt động ngoài trời', leaf: false, children: [{ category_id: 31, name: 'Quần bảo hộ', leaf: true }] },
    ] });
    api.attributes.mockResolvedValue({ data: [{ name: 'material', label: 'Chất liệu trang phục', attribute_type: 'normal', input_type: 'singleselect', is_mandatory: 1 }] });
    const onSelect = vi.fn();
    function Subject() {
      const [selectedCategoryId, setSelectedCategoryId] = useState('');
      return <LazadaCategoryPanel channelId="channel-1" productName="Quần kaki ronaldo" coreCategory="Quần" selectedCategoryId={selectedCategoryId} onSelect={(id, path, attributes) => { setSelectedCategoryId(id); onSelect(id, path, attributes); }} />;
    }
    render(<Subject />);

    expect(await screen.findByRole('button', { name: 'Quần áo nữ › Quần dài' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Điện tử › Điện thoại' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thiết bị thể thao & hoạt động ngoài trời › Quần bảo hộ' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Tìm ngành hàng Lazada' }), { target: { value: 'Điện thoại' } });
    expect(screen.queryByRole('button', { name: 'Điện tử › Điện thoại' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Tìm ngành hàng Lazada' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Quần áo nữ › Quần dài' }));
    expect(await screen.findByText('Chất liệu trang phục')).toBeInTheDocument();
    expect(onSelect).toHaveBeenCalledWith('11', 'Quần áo nữ › Quần dài', expect.any(Array));
  });

  it('keeps other Lazada categories available for a non-fashion product', async () => {
    api.categories.mockResolvedValue({ data: [
      { category_id: 20, name: 'Điện tử', leaf: false, children: [{ category_id: 21, name: 'Điện thoại', leaf: true }] },
    ] });
    render(<LazadaCategoryPanel channelId="channel-1" productName="Điện thoại" coreCategory="Điện tử" />);
    expect(await screen.findByRole('button', { name: 'Điện tử › Điện thoại' })).toBeInTheDocument();
  });
});
