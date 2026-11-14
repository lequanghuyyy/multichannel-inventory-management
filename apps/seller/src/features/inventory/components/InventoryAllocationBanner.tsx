const terms = [
  { value: 'Thực tế', label: 'Tồn kho', icon: 'inventory_2' },
  { value: 'Chưa giao', label: 'Đang giữ', icon: 'orders' },
  { value: 'Chống bán vượt', label: 'Tồn đệm an toàn', icon: 'shield' },
  { value: 'Đăng lên kênh', label: 'Có thể bán', icon: 'broadcast_on_personal' },
] as const;

export function InventoryAllocationBanner() {
  return (
    <section className="overflow-hidden rounded-card bg-carbon text-pure-white shadow-artifact" aria-labelledby="allocation-engine-title">
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[0.75fr_1.25fr] lg:items-center">
        <div><span className="font-body text-caption font-semibold uppercase tracking-[0.16em] text-pure-white/55">Cách tính số lượng</span><h2 id="allocation-engine-title" className="mt-2 whitespace-nowrap font-display text-2xl font-bold">Phân bổ tồn kho</h2><p className="mt-3 max-w-lg font-body text-body-sm leading-5 text-pure-white/65">Số lượng có thể bán = tồn kho − đang giữ − tồn đệm an toàn. Hệ thống tự tính, bạn không cần tính lại.</p></div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1.2fr]">
          {terms.map((term, index) => (
            <div key={term.label} className="contents">
              {index > 0 ? <span className="hidden font-display text-xl text-apricot sm:block" aria-hidden="true">{index === terms.length - 1 ? '=' : '−'}</span> : null}
              <div className={index === terms.length - 1 ? 'col-span-3 rounded-control bg-apricot p-3 text-carbon sm:col-span-1' : 'rounded-control bg-pure-white/10 p-3'}>
                <span className="material-symbols-outlined text-lg" aria-hidden="true">{term.icon}</span><strong className="mt-2 block font-body text-caption uppercase tracking-wide">{term.value}</strong><span className={index === terms.length - 1 ? 'font-body text-[10px] text-carbon/65' : 'font-body text-[10px] text-pure-white/55'}>{term.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-pure-white/10 px-5 py-3 font-body text-caption text-pure-white/60 sm:px-6">Số lượng có thể bán được đăng lên Shopee, TikTok Shop, Lazada, website và quầy bán hàng.</div>
    </section>
  );
}
