import { useEffect, useRef, useState } from 'react';
import { getProductMediaContent, listProductMedia } from '../../../api/products';

export function ChannelProductImage({ productId, className = 'size-10' }: { productId: string; className?: string }) {
  const host = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [imageURL, setImageURL] = useState('');

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
    let objectURL = '';
    void listProductMedia(productId, controller.signal).then(async ({ media }) => {
      const primary = media.find((item) => item.is_primary) ?? media[0];
      if (!primary || controller.signal.aborted) return;
      const content = await getProductMediaContent(productId, primary.id, controller.signal);
      if (!controller.signal.aborted) { objectURL = URL.createObjectURL(content); setImageURL(objectURL); }
    }).catch(() => { /* The placeholder remains when a product has no available image. */ });
    return () => { controller.abort(); if (objectURL) URL.revokeObjectURL(objectURL); };
  }, [productId, visible]);

  return <span ref={host} className={`grid shrink-0 place-items-center overflow-hidden rounded-lg border border-outline-variant bg-cream-paper text-on-surface ${className}`} aria-hidden="true">
    {imageURL ? <img src={imageURL} alt="" className="size-full object-cover" /> : <span className="material-symbols-outlined">inventory_2</span>}
  </span>;
}
