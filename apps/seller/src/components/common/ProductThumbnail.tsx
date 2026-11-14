import { useEffect, useRef, useState } from 'react';
import { getProductMediaContent } from '../../api/products';
import { cn } from '../../lib/cn';

const categoryIcon: Record<string, string> = {
  FOOTWEAR: 'steps',
  APPAREL: 'checkroom',
  ACCESSORIES: 'account_balance_wallet',
};

export function ProductThumbnail({ productId, mediaId, category, fallbackIcon, className }: {
  productId?: string;
  mediaId?: string;
  category?: string;
  /** Inventory rows already resolved a category icon; use it instead of the category lookup. */
  fallbackIcon?: string;
  className?: string;
}) {
  const container = useRef<HTMLSpanElement>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setObjectUrl(null);
    setFailed(false);
    if (!productId || !mediaId) return;
    const scope = { productId, mediaId };

    const controller = new AbortController();
    let active = true;
    let started = false;
    let nextObjectUrl: string | null = null;
    let observer: IntersectionObserver | null = null;

    const load = async () => {
      if (started) return;
      started = true;
      try {
        const blob = await getProductMediaContent(scope.productId, scope.mediaId, controller.signal);
        if (!active) return;
        nextObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(nextObjectUrl);
      } catch {
        if (active && !controller.signal.aborted) setFailed(true);
      }
    };

    if (typeof IntersectionObserver === 'function' && container.current) {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer?.disconnect();
          void load();
        }
      }, { rootMargin: '160px' });
      observer.observe(container.current);
    } else {
      void load();
    }

    return () => {
      active = false;
      controller.abort();
      observer?.disconnect();
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  }, [mediaId, productId]);

  const icon = fallbackIcon ?? categoryIcon[category ?? ''] ?? 'qr_code_2';
  return (
    <span ref={container} className={cn('grid shrink-0 place-items-center overflow-hidden rounded-control bg-surface-container-low text-graphite', className)} aria-hidden="true">
      {objectUrl && !failed
        ? <img src={objectUrl} alt="" decoding="async" className="h-full w-full object-cover" onError={() => setFailed(true)} />
        : <span className="material-symbols-outlined text-xl">{icon}</span>}
    </span>
  );
}
