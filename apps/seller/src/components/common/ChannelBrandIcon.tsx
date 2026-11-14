export function ChannelBrandIcon({ code, simulated = false }: { code: string; simulated?: boolean }) {
  const normalized = code.toLocaleLowerCase('en');
  if (simulated) return <span className="material-symbols-outlined text-[24px]" aria-hidden="true">science</span>;
  if (normalized.includes('shopify')) return <svg viewBox="0 0 40 40" className="size-8" role="img" aria-label="Shopify">
    <path d="M10 12.5 12.5 8h15l2.5 4.5 2 22H8l2-22Z" fill="#95BF47" />
    <path d="M14.2 13c0-4 2.2-7 5.8-7s5.8 3 5.8 7" fill="none" stroke="#5E8E3E" strokeWidth="2.2" strokeLinecap="round" />
    <text x="20" y="28" textAnchor="middle" fill="white" fontSize="19" fontWeight="700" fontFamily="Arial, sans-serif">S</text>
  </svg>;
  if (normalized.includes('ebay')) return <svg viewBox="0 0 54 24" className="h-7 w-12" role="img" aria-label="eBay">
    <text x="1" y="19" fill="#E53238" fontSize="19" fontWeight="700" fontFamily="Arial, sans-serif">e</text>
    <text x="13" y="19" fill="#0064D2" fontSize="19" fontWeight="700" fontFamily="Arial, sans-serif">b</text>
    <text x="26" y="19" fill="#F5AF02" fontSize="19" fontWeight="700" fontFamily="Arial, sans-serif">a</text>
    <text x="39" y="19" fill="#86B817" fontSize="19" fontWeight="700" fontFamily="Arial, sans-serif">y</text>
  </svg>;
  if (normalized.includes('woocommerce')) return <svg viewBox="0 0 48 34" className="h-7 w-10" role="img" aria-label="WooCommerce">
    <path d="M6 3h36a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H24l-9 5v-5H6a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z" fill="#7F54B3" />
    <text x="24" y="21" textAnchor="middle" fill="white" fontSize="13" fontWeight="700" fontFamily="Arial, sans-serif">Woo</text>
  </svg>;
  if (normalized.includes('shopee')) return <svg viewBox="0 0 40 40" className="size-8" role="img" aria-label="Shopee">
    <path d="M9 14h22l-1.7 21H10.7L9 14Z" fill="#EE4D2D" />
    <path d="M14 15v-2a6 6 0 0 1 12 0v2" fill="none" stroke="#EE4D2D" strokeWidth="2.5" strokeLinecap="round" />
    <text x="20" y="29" textAnchor="middle" fill="white" fontSize="17" fontWeight="700" fontFamily="Arial, sans-serif">S</text>
  </svg>;
  if (normalized.includes('lazada')) return <svg viewBox="0 0 40 40" className="size-8" role="img" aria-label="Lazada">
    <path d="m20 4 16 16-16 16L4 20 20 4Z" fill="#6C1D9C" />
    <path d="m20 4 9 9-9 9-9-9 9-9Z" fill="#F36F21" />
    <path d="m11 22 9-9 9 9-9 9-9-9Z" fill="#F7B600" />
    <path d="m20 13 9 9-9 9-9-9 9-9Z" fill="#1A9DCE" />
  </svg>;
  if (normalized.includes('tiktok')) return <svg viewBox="0 0 36 36" className="size-8" role="img" aria-label="TikTok">
    <rect x="2" y="2" width="32" height="32" rx="9" fill="#111" />
    <path d="M20 7v14.2a4.2 4.2 0 1 1-3.1-4.05V13.8a8.4 8.4 0 1 0 6.6 8.2V14a10.6 10.6 0 0 0 5 1.3V11a6.3 6.3 0 0 1-5-4H20Z" fill="#25F4EE" transform="translate(-1 1)" />
    <path d="M21 6v14.2a4.2 4.2 0 1 1-3.1-4.05V12.8a8.4 8.4 0 1 0 6.6 8.2V13a10.6 10.6 0 0 0 5 1.3V10a6.3 6.3 0 0 1-5-4H21Z" fill="#FE2C55" opacity=".85" />
    <path d="M20 7v14.2a4.2 4.2 0 1 1-3.1-4.05V13.8a8.4 8.4 0 1 0 6.6 8.2V14a10.6 10.6 0 0 0 5 1.3V11a6.3 6.3 0 0 1-5-4H20Z" fill="white" />
  </svg>;
  return <span className="material-symbols-outlined text-[24px]" aria-hidden="true">{normalized.includes('pos') ? 'point_of_sale' : 'storefront'}</span>;
}
