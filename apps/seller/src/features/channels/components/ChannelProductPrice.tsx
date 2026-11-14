import { useEffect, useRef, useState } from 'react';
import { getChannelPrices } from '../../../api/products';

export function ChannelProductPrice({ productId, channelId, variantCount }: { productId: string; channelId: string; variantCount: number }) {
  const host = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [label, setLabel] = useState('Đang chờ đọc giá');

  useEffect(() => {
    const target = host.current;
    if (!target) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '160px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    void getChannelPrices(productId, controller.signal).then(({ prices }) => {
      if (controller.signal.aborted) return;
      const channelPrices = prices.filter((price) => price.channel_id === channelId);
      const verified = channelPrices.filter((price) => price.sync_state === 'verified' && price.last_verified_amount !== undefined && price.last_verified_amount !== null);
      if (!verified.length) { setLabel('Chưa xác minh giá trên kênh'); return; }
      const amounts = verified.map((price) => Number(price.last_verified_amount)).filter(Number.isFinite);
      const currency = verified[0]?.currency ?? '';
      if (verified.length < variantCount || amounts.length !== verified.length) { setLabel(`Đã xác minh ${verified.length}/${variantCount} SKU · ${currency}`); return; }
      const low = Math.min(...amounts); const high = Math.max(...amounts);
      const formatted = (amount: number) => `${amount.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} ${currency}`;
      setLabel(low === high ? formatted(low) : `${formatted(low)}–${formatted(high)}`);
    }).catch(() => { if (!controller.signal.aborted) setLabel('Chưa đọc được giá theo kênh'); });
    return () => controller.abort();
  }, [channelId, productId, variantCount, visible]);

  return <span ref={host}>{label}</span>;
}
