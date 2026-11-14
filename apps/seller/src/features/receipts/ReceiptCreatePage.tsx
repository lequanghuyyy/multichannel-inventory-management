import { useEffect, useRef, useState } from 'react';
import { href, navigate } from '../../app/routes';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { createReceipt, type CreateItemInput } from '../../api/receipts';
import { listInventory, type InventoryRow } from '../../api/inventory';

const INTENT_STORAGE_KEY = 'datt_receipt_create_intent';

interface ActiveIntent {
  key: string;
  fingerprint: string;
}

function computePayloadFingerprint(payload: {
  supplier_name: string;
  reference_number?: string;
  receipt_number?: string;
  note?: string;
  items: { sku: string; expected_quantity: number; unit_cost_minor?: number }[];
}): string {
  const sortedItems = [...payload.items].sort((a, b) => a.sku.localeCompare(b.sku));
  return JSON.stringify({
    supplier_name: payload.supplier_name.trim(),
    reference_number: (payload.reference_number || '').trim(),
    receipt_number: (payload.receipt_number || '').trim(),
    note: (payload.note || '').trim(),
    items: sortedItems.map((it) => ({
      sku: it.sku.trim().toUpperCase(),
      expected_quantity: it.expected_quantity,
      unit_cost_minor: it.unit_cost_minor,
    })),
  });
}

interface SelectedItem extends CreateItemInput {
  productName?: string;
  variantInfo?: string;
  currentOnHand?: number;
}

export function ReceiptCreatePage() {
  const [supplierName, setSupplierName] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [note, setNote] = useState('');

  const [items, setItems] = useState<SelectedItem[]>([]);
  const [skuCatalog, setSkuCatalog] = useState<InventoryRow[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  // New item draft inputs
  const [chosenSku, setChosenSku] = useState(() => new URLSearchParams(window.location.search).get('sku') ?? '');
  const [expectedQty, setExpectedQty] = useState(1);
  const [unitCost, setUnitCost] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Idempotency intent & reload recovery state
  const [activeIntent, setActiveIntent] = useState<ActiveIntent | null>(null);
  const [isRecovered, setIsRecovered] = useState(false);
  const submittingRef = useRef(false);

  // Attempt to recover uncertain in-flight or drafted create intent from sessionStorage
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(INTENT_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.key && saved?.fingerprint) {
          setActiveIntent({ key: saved.key, fingerprint: saved.fingerprint });
          if (saved.formDraft) {
            setSupplierName(saved.formDraft.supplierName || '');
            setReferenceNumber(saved.formDraft.referenceNumber || '');
            setReceiptNumber(saved.formDraft.receiptNumber || '');
            setNote(saved.formDraft.note || '');
            setItems(saved.formDraft.items || []);
            setIsRecovered(true);
          }
        }
      }
    } catch {
      // sessionStorage full or unavailable
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      setCatalogLoading(true);
      try {
        const res = await listInventory({ limit: 100 });
        if (active) setSkuCatalog(res.items);
      } catch {
        // Catalogue lookup is an assistance tool; fallback to free typing if network fails
      } finally {
        if (active) setCatalogLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSku = chosenSku.trim().toUpperCase();
    if (!cleanSku) return;
    if (expectedQty <= 0) {
      setErrorMsg('Số lượng dự kiến phải lớn hơn 0');
      return;
    }
    const costText = unitCost.trim();
    const unitCostMinor = costText === '' ? undefined : Number(costText);
    if (unitCostMinor !== undefined && (!/^\d+$/.test(costText) || !Number.isSafeInteger(unitCostMinor) || unitCostMinor < 0)) {
      setErrorMsg('Đơn giá nhập phải là số nguyên VND không âm; có thể để trống nếu chưa rõ.');
      return;
    }

    const matched = skuCatalog.find((c) => c.sku.toUpperCase() === cleanSku);
    const existingIndex = items.findIndex((it) => it.sku.toUpperCase() === cleanSku);

    if (existingIndex >= 0) {
      if (items[existingIndex]?.unit_cost_minor !== unitCostMinor) {
        setErrorMsg('SKU đã có đơn giá khác trong phiếu. Hãy dùng cùng một đơn giá hoặc xóa dòng cũ.');
        return;
      }
      // Consolidate quantity
      setItems((prev) =>
        prev.map((it, idx) =>
          idx === existingIndex ? { ...it, expected_quantity: it.expected_quantity + expectedQty } : it
        )
      );
    } else {
      setItems((prev) => [
        ...prev,
        {
          sku: cleanSku,
          expected_quantity: expectedQty,
          ...(unitCostMinor !== undefined ? { unit_cost_minor: unitCostMinor } : {}),
          productName: matched?.product_name || cleanSku,
          variantInfo: matched ? `${matched.color} · ${matched.size}` : undefined,
          currentOnHand: matched?.on_hand,
        },
      ]);
    }

    setChosenSku('');
    setExpectedQty(1);
    setUnitCost('');
    setErrorMsg(null);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleResetSession = () => {
    sessionStorage.removeItem(INTENT_STORAGE_KEY);
    setActiveIntent(null);
    setIsRecovered(false);
    setSupplierName('');
    setReferenceNumber('');
    setReceiptNumber('');
    setNote('');
    setItems([]);
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || submitting) {
      return; // Prevent concurrent double-clicks
    }
    setErrorMsg(null);

    const cleanSupplier = supplierName.trim();
    if (!cleanSupplier) {
      setErrorMsg('Vui lòng nhập tên nhà cung cấp.');
      return;
    }
    if (items.length === 0) {
      setErrorMsg('Vui lòng thêm ít nhất một sản phẩm / SKU vào phiếu nhập.');
      return;
    }

    const payload = {
      supplier_name: cleanSupplier,
      reference_number: referenceNumber.trim() || undefined,
      receipt_number: receiptNumber.trim() || undefined,
      note: note.trim() || undefined,
      items: items.map((it) => ({
        sku: it.sku,
        expected_quantity: it.expected_quantity,
        ...(it.unit_cost_minor !== undefined ? { unit_cost_minor: it.unit_cost_minor } : {}),
      })),
    };

    const currentFingerprint = computePayloadFingerprint(payload);

    // Reuse idempotency key if intent & payload match; generate new key only if payload changed
    let keyToUse = activeIntent?.fingerprint === currentFingerprint ? activeIntent.key : null;
    if (!keyToUse) {
      keyToUse = crypto.randomUUID();
      setActiveIntent({ key: keyToUse, fingerprint: currentFingerprint });
    }

    // Persist intent before network call for reload recovery
    try {
      sessionStorage.setItem(
        INTENT_STORAGE_KEY,
        JSON.stringify({
          key: keyToUse,
          fingerprint: currentFingerprint,
          formDraft: {
            supplierName,
            referenceNumber,
            receiptNumber,
            note,
            items,
          },
          timestamp: Date.now(),
        })
      );
    } catch {
      // sessionStorage full or unavailable
    }

    submittingRef.current = true;
    setSubmitting(true);

    try {
      const res = await createReceipt(payload, keyToUse);
      sessionStorage.removeItem(INTENT_STORAGE_KEY);
      navigate(href({ name: 'receipt-detail', id: res.id }));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi khi tạo phiếu nhập hàng.');
      // Keep activeIntent and sessionStorage intact so retrying reuses the same idempotency key
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const totalLines = items.length;
  const totalUnits = items.reduce((acc, it) => acc + it.expected_quantity, 0);

  return (
    <section className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 py-7 sm:gap-7 sm:py-8">
      <header>
        <Button variant="ghost" onClick={() => navigate(href({ name: 'receipts' }))} className="mb-3 self-start">
          ← Danh sách phiếu nhập
        </Button>
        <p className="mb-1 font-body text-caption font-bold uppercase tracking-[0.14em] text-channel-accent">Kho · Nhập hàng</p>
        <h1 className="font-display text-[clamp(2rem,4vw,3rem)] font-bold leading-[1.05] tracking-[-0.035em] text-on-surface">Tạo phiếu nhập hàng</h1>
        <p className="mt-3 max-w-2xl font-body text-body-sm leading-6 text-graphite">
          Lập phiếu từ nhà cung cấp. Tồn kho chỉ thay đổi khi hàng đến và được xác nhận thực nhận.
        </p>
      </header>

      {isRecovered ? (
        <div
          className="flex flex-col gap-3 rounded-control border border-channel-accent/30 bg-surface-container-low p-4 sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <div className="font-body text-body-sm text-on-surface">
            <strong className="text-channel-accent">Khôi phục phiên tạo phiếu:</strong> Đã phục hồi dữ liệu từ phiên chưa hoàn tất trước đó. Bạn có thể tiếp tục lưu với cùng mã định danh hoặc làm mới.
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={handleResetSession}>
            Làm mới phiên
          </Button>
        </div>
      ) : null}

      {errorMsg ? (
        <div className="rounded-control bg-error-container p-4 font-body text-body-sm text-on-error-container" role="alert">
          <strong>Lỗi:</strong> {errorMsg}
        </div>
      ) : null}

      <form onSubmit={handleSubmit}>
        <Card className="overflow-hidden border border-metric-ink bg-channel-paper p-0 shadow-metric ring-0">
          <div className="flex flex-col justify-between gap-4 border-b border-dashed border-sandstone bg-surface-container-low p-5 sm:flex-row sm:items-center sm:p-7">
            <div>
              <p className="font-body text-caption font-bold uppercase tracking-[0.16em] text-channel-accent">Chứng từ kho</p>
              <h2 className="mt-1 font-display text-2xl font-bold tracking-[-0.03em] text-on-surface">PHIẾU NHẬP HÀNG</h2>
              <p className="mt-1 font-body text-caption text-graphite">Thông tin dự kiến · Chưa cộng vào tồn kho</p>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-control border border-sandstone bg-pure-white px-4 py-3 font-body text-caption sm:min-w-64">
              <span className="text-graphite">Trạng thái</span><strong className="text-right text-on-surface">Bản nháp</strong>
              <span className="text-graphite">Số dòng</span><strong className="text-right font-mono text-on-surface">{totalLines} SKU</strong>
            </div>
          </div>

          <section className="grid gap-4 border-b border-dashed border-sandstone p-5 sm:p-7" aria-labelledby="receipt-info-heading">
            <div className="flex items-baseline justify-between gap-4">
              <h3 id="receipt-info-heading" className="font-display text-lg font-bold text-on-surface">Thông tin chứng từ</h3>
              <span className="font-body text-caption text-graphite">Nhà cung cấp và tham chiếu</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Input
                label="Tên nhà cung cấp *"
                required
                placeholder="VD: Tổng kho Giày dép An Khánh"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
              />
              <Input
                label="Mã tham chiếu / Số hóa đơn (Tùy chọn)"
                placeholder="VD: INV-2026-9988"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
              />
              <Input
                label="Mã phiếu nhập (Tùy chọn - để trống để tự sinh)"
                placeholder="VD: REC-20261012-01"
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
              />
              <Input
                label="Ghi chú đợt nhập (Tùy chọn)"
                placeholder="Điều kiện giao nhận, vị trí kho…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </section>

          <section className="grid gap-5 p-5 sm:p-7" aria-labelledby="receipt-items-heading">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
              <div>
                <p className="font-body text-caption font-bold uppercase tracking-[0.12em] text-channel-accent">Bảng kê hàng hóa</p>
                <h3 id="receipt-items-heading" className="mt-1 font-display text-lg font-bold text-on-surface">Danh sách SKU dự kiến nhận</h3>
                <p className="mt-0.5 font-body text-caption text-graphite">Chọn SKU từ kho hoặc nhập trực tiếp mã SKU cần nhập.</p>
              </div>
              <span className="font-mono text-caption font-semibold text-on-surface">{totalLines} SKU · {totalUnits} chiếc dự kiến</span>
            </div>

            <div className="rounded-lg border border-sandstone bg-surface-container-low p-4">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px_190px_auto] sm:items-end">
                <div>
                  <label className="mb-1 block font-body text-caption font-semibold text-on-surface" htmlFor="sku-select">Mã SKU</label>
                  <input
                    id="sku-select"
                    list="sku-catalog-list"
                    className="min-h-11 w-full rounded-control border border-outline-variant bg-pure-white px-3 font-mono text-sm text-on-surface focus:border-carbon focus:outline-none focus:ring-2 focus:ring-carbon/20"
                    placeholder="Chọn hoặc gõ SKU (VD: SHOE-001-BLK-42)…"
                    value={chosenSku}
                    onChange={(e) => setChosenSku(e.target.value)}
                  />
                  <datalist id="sku-catalog-list">
                    {skuCatalog.map((c) => <option key={c.sku} value={c.sku}>{c.product_name} ({c.color} · {c.size}) - Tồn kho: {c.on_hand}</option>)}
                  </datalist>
                </div>
                <div>
                  <label className="mb-1 block font-body text-caption font-semibold text-on-surface" htmlFor="expected-qty">Số lượng dự kiến</label>
                  <input
                    id="expected-qty"
                    type="number"
                    min="1"
                    max="1000000"
                    className="min-h-11 w-full rounded-control border border-outline-variant bg-pure-white px-3 font-mono text-sm text-on-surface focus:border-carbon focus:outline-none focus:ring-2 focus:ring-carbon/20"
                    value={expectedQty}
                    onChange={(e) => setExpectedQty(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </div>
                <Input label="Đơn giá nhập (VND, tùy chọn)" type="number" min={0} step={1} inputMode="numeric" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} />
                <Button type="button" variant="secondary" onClick={handleAddItem} disabled={!chosenSku.trim() || catalogLoading}>Thêm SKU</Button>
              </div>
            </div>

            {items.length === 0 ? (
              <p className="rounded-control border border-dashed border-outline-variant p-6 text-center font-body text-body-sm text-graphite">
                Chưa có sản phẩm nào trong phiếu. Chọn SKU ở ô phía trên và bấm <strong>Thêm SKU</strong>.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-control border border-sandstone">
                <table className="w-full min-w-[760px] border-collapse text-left font-body text-body-sm">
                  <caption className="sr-only">Các dòng hàng dự kiến trong phiếu nhập</caption>
                  <thead>
                    <tr className="border-b border-sandstone bg-surface-container-low text-caption font-semibold uppercase tracking-wider text-graphite">
                      <th className="py-3 px-3">SKU</th><th className="py-3 px-3">Tên sản phẩm</th><th className="py-3 px-3 text-right">Tồn hiện tại</th><th className="py-3 px-3 text-right">SL dự kiến</th><th className="py-3 px-3 text-right">Đơn giá nhập</th><th className="py-3 px-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container">
                    {items.map((it, idx) => (
                      <tr key={it.sku} className="hover:bg-surface-container-low/50">
                        <td className="py-3 px-3"><code className="font-mono text-caption font-bold text-on-surface">{it.sku}</code></td>
                        <td className="py-3 px-3"><strong className="block text-on-surface">{it.productName}</strong>{it.variantInfo ? <span className="text-caption text-graphite">{it.variantInfo}</span> : null}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-graphite">{it.currentOnHand !== undefined ? it.currentOnHand : '—'}</td>
                        <td className="py-3 px-3 text-right font-mono font-bold tabular-nums text-on-surface">{it.expected_quantity}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-graphite">{it.unit_cost_minor === undefined ? 'Chưa nhập' : `${new Intl.NumberFormat('vi-VN').format(it.unit_cost_minor)} ₫`}</td>
                        <td className="py-3 px-3 text-right"><Button variant="ghost" size="sm" type="button" className="text-error hover:bg-error-container" onClick={() => handleRemoveItem(idx)}>Xóa</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <footer className="flex flex-col justify-between gap-4 border-t-2 border-dashed border-sandstone bg-surface-container-low/70 p-5 sm:flex-row sm:items-center sm:p-7">
            <div className="flex flex-wrap gap-x-8 gap-y-2 font-body text-body-sm">
              <span className="text-graphite">Số dòng: <strong className="font-mono text-on-surface">{totalLines} SKU</strong></span>
              <span className="text-graphite">Tổng lượng dự kiến: <strong className="font-mono text-on-surface">{totalUnits} chiếc</strong></span>
            </div>
            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="ghost" type="button" onClick={() => navigate(href({ name: 'receipts' }))}>Hủy</Button>
              <Button type="submit" loading={submitting} disabled={submitting || items.length === 0}>Lưu phiếu nháp (DRAFT)</Button>
            </div>
          </footer>
        </Card>
      </form>
    </section>
  );
}
