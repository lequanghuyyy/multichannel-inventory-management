import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cn } from '../../lib/cn';
import { Button } from './Button';
import { Input } from './Input';
import { Modal } from './Modal';
import { Tabs } from './Tabs';

afterEach(cleanup);

describe('shared UI foundation', () => {
  it('merges conflicting Tailwind utility classes', () => {
    expect(cn('px-2 text-sm', false, 'px-4')).toBe('text-sm px-4');
  });

  it('exposes loading state and disables duplicate button actions', () => {
    render(<Button loading loadingLabel="Đang lưu">Lưu</Button>);
    expect(screen.getByRole('button', { name: 'Đang lưu' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Đang lưu' })).toHaveAttribute('aria-busy', 'true');
  });

  it('associates an input with its label and validation message', () => {
    render(<Input label="Canonical SKU" error="SKU không hợp lệ" />);
    const input = screen.getByLabelText('Canonical SKU');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('SKU không hợp lệ');
  });

  it('renders an accessible modal and closes it with Escape', () => {
    const onClose = vi.fn();
    render(<Modal open title="Xác nhận thao tác" onClose={onClose}><p>Nội dung</p></Modal>);
    expect(screen.getByRole('dialog', { name: 'Xác nhận thao tác' })).toHaveAttribute('aria-modal', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('moves shared tabs with arrow keys and exposes panel relationships', () => {
    function TestTabs() {
      const [value, setValue] = useState<'one' | 'two'>('one');
      return <Tabs ariaLabel="Test tabs" idPrefix="test" items={[{ value: 'one', label: 'One' }, { value: 'two', label: 'Two' }]} value={value} onValueChange={setValue} />;
    }
    render(<TestTabs />);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'One' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-controls', 'test-panel-two');
  });
});
