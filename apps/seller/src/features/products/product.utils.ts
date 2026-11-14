import type { ProductCatalogItem, ProductFilters } from './product.types';

export function filterProducts(products: readonly ProductCatalogItem[], filters: ProductFilters): ProductCatalogItem[] {
  const query = filters.query.trim().toLocaleLowerCase('vi-VN');
  return products.filter((product) => {
    if (filters.category !== 'all' && product.category !== filters.category) return false;
    if (filters.status !== 'all' && product.status !== filters.status) return false;
    if (filters.inventory !== 'all' && product.inventory.state !== filters.inventory) return false;
    if (filters.channel !== 'all' && !product.channels.some((channel) => channel.id === filters.channel)) return false;
    if (!query) return true;
    const searchable = [product.name, product.masterSku, product.brand, product.category, ...product.variants.map((variant) => variant.sku)].join(' ').toLocaleLowerCase('vi-VN');
    return searchable.includes(query);
  });
}

export function inventoryPercentage(product: ProductCatalogItem): number {
  return product.inventory.sellableRate;
}

export function formatProductUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}
