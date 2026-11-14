import type { InventorySnapshot } from '../features/shared/types';

// These are mock API responses. available_to_sell is supplied by the response, never calculated in React.
export const inventorySnapshots: InventorySnapshot[] = [
  { variant_id: '10000000-0000-4000-8000-000000000001', product_id: '00000000-0000-4000-8000-000000000001', sku: 'JACKET-URBAN-BLK-M', color: 'Đen', size: 'M', on_hand: 10, reserved: 2, safety_buffer: 1, available_to_sell: 7, version: 3 },
  { variant_id: '10000000-0000-4000-8000-000000000002', product_id: '00000000-0000-4000-8000-000000000001', sku: 'JACKET-URBAN-BGE-L', color: 'Be', size: 'L', on_hand: 6, reserved: 1, safety_buffer: 1, available_to_sell: 4, version: 2 },
  { variant_id: '10000000-0000-4000-8000-000000000003', product_id: '00000000-0000-4000-8000-000000000002', sku: 'TEE-ESS-WHT-S', color: 'Trắng', size: 'S', on_hand: 18, reserved: 3, safety_buffer: 2, available_to_sell: 13, version: 5 },
];
