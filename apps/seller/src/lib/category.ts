const labels: Record<string, string> = {
  footwear: 'Giày dép',
  apparel: 'Quần áo',
  accessories: 'Phụ kiện',
  leather: 'Đồ da',
  bags: 'Túi xách',
  other: 'Khác',
};

/**
 * Display name for a stored category. The API keeps the raw value (`FOOTWEAR`); the screen
 * shows Vietnamese. A category without a known name is shown as stored rather than guessed,
 * so a new category is never silently renamed.
 */
export function categoryLabel(value: string): string {
  if (value === '') return '—';
  return labels[value.toLowerCase()] ?? value;
}
