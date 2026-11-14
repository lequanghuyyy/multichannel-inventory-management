import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { orders } from '../../../mocks/orders';
import type { Order } from '../order.types';
import { OrdersLedger } from './OrdersLedger';

const noop = () => undefined;

function renderLedger(list: Order[], overrides: Partial<React.ComponentProps<typeof OrdersLedger>> = {}) {
  return render(
    <OrdersLedger
      orders={list}
      selectedIds={new Set<string>()}
      onToggle={noop}
      onToggleAll={noop}
      onPreview={noop}
      onOpen={noop}
      {...overrides}
    />,
  );
}

// OrdersLedger renders two responsive layouts — a table and a stack of cards — and hides one
// with CSS rather than a media query, so jsdom sees BOTH. Every row therefore appears twice,
// and a missing line reads twice as well. Counting to 2 is how these tests tell "one order
// missing its lines" apart from "the whole screen fell back"; it is not an arbitrary number.
afterEach(cleanup);

// An order summary from GET /api/v1/orders carries no lines. `Order.items` is typed as a
// required array, so nothing stops that summary from reaching this component — and `items[0]!`
// then threw during render, taking the whole screen down instead of one cell. These tests pin
// the behaviour that replaced it: a missing line is rendered, never dereferenced.
describe('OrdersLedger with an order that has no line items', () => {
  // itemCount 1 with no lines: the shape a real order summary has. The label has to carry the
  // count, because "no lines" alone would read as an empty order — a false accusation about a
  // sale that already happened.
  const summary: Order = { ...orders[0]!, items: [] };
  const summaryLabel = '1 dòng · chưa tải chi tiết';

  it('renders the summary instead of crashing on it', () => {
    // No expect(...).not.toThrow(): the old code passed [] straight to `items[0]!` and the
    // throw happened during render, so a render that completes is itself the assertion. What
    // the labels add is the reason it did not throw — the gap was rendered, not skipped.
    renderLedger([summary]);

    expect(screen.getAllByText(summaryLabel)).toHaveLength(2);
    // The rest of the row survives. Guarding the line must not have cost the order its
    // identity, customer or total.
    expect(screen.getAllByText(summary.reference).length).toBeGreaterThan(0);
    expect(screen.getAllByText(summary.customer.name).length).toBeGreaterThan(0);
    expect(screen.getAllByText(summary.total.formatted).length).toBeGreaterThan(0);
  });

  it('renders the line when the order has one', () => {
    renderLedger([orders[0]!]);

    expect(screen.queryByText(summaryLabel)).toBeNull();
    expect(screen.getAllByText('SHOE-001-BLK-42').length).toBeGreaterThan(0);
  });

  it('treats the gap as per order rather than per screen', () => {
    // The regression this guards is subtle: a guard that returns early from the whole map
    // would render neither row, and a count of 2 would pass while the screen was empty.
    renderLedger([summary, orders[1]!]);

    expect(screen.getAllByText(summaryLabel)).toHaveLength(2);
    expect(screen.getAllByText('BOTL-AERO-750').length).toBeGreaterThan(0);
  });

  it('keeps the row actionable, because an order you cannot open is an order you cannot look up', () => {
    const onPreview = vi.fn();
    const onOpen = vi.fn();
    renderLedger([summary], { onPreview, onOpen });

    expect(screen.getAllByRole('button', { name: `Xem nhanh ${summary.reference}` }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Chi tiết').length).toBeGreaterThan(0);
  });

  it('says an order really is empty instead of calling it an unloaded summary', () => {
    // The two cases look identical in the type and very different to a shopkeeper. With
    // itemCount 0 there is nothing left to load, so the honest label is the plain one.
    const genuinelyEmpty: Order = { ...summary, itemCount: 0 };
    renderLedger([genuinelyEmpty]);

    expect(screen.getAllByText('Chưa có dòng hàng')).toHaveLength(2);
    expect(screen.queryByText(summaryLabel)).toBeNull();
  });
});
