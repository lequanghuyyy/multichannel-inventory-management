import { expect, it } from 'vitest';
import { getInventory } from './mock-api';

it('returns precomputed available_to_sell from inventory mock responses', async () => {
  const inventory = await getInventory('default');
  expect(inventory).toHaveLength(3);
  expect(inventory[0]).toMatchObject({ sku: 'JACKET-URBAN-BLK-M', on_hand: 10, reserved: 2, safety_buffer: 1, available_to_sell: 7 });
});

it('supports an explicit mock empty state', async () => {
  await expect(getInventory('empty')).resolves.toEqual([]);
});
