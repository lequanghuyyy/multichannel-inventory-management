import { useCallback, useEffect, useRef, useState } from 'react';
import { importProducts, type ProductImportResult } from '../../../api/products';
import { Button } from '../../../components/ui/Button';
import { newIdempotencyKey } from '../product.write';

const template = 'master_sku,variant_sku,name,category,brand,color,size,currency\n';

/**
 * The CSV import panel.
 *
 * The order of operations is the whole design: **dry run first, always.** The button reads
 * "Kiểm tra" and the commit button is disabled until a dry run has come back, so the operator
 * cannot commit a file they have not read. A catalogue import is bulk data from a spreadsheet a
 * human edited; committing first and reviewing afterwards means reviewing a catalogue that has
 * already changed.
 *
 * The problem list is the reason the dry run exists. Each row is numbered the way the file is
 * — line 1 is the header — so "line 47" points at something the operator can find without
 * counting.
 */
export function ProductImportPanel({ canWrite = true, disabledReason, onCommitted }: { canWrite?: boolean; disabledReason?: string; onCommitted?: () => void }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<{ file: string; result: ProductImportResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'dry' | 'commit' | null>(null);
  const [committed, setCommitted] = useState<ProductImportResult | null>(null);
  const requestVersion = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const commitAttempt = useRef<{ file: string; key: string } | null>(null);

  const replaceText = useCallback((next: string) => {
    requestVersion.current += 1;
    activeRequest.current?.abort();
    activeRequest.current = null;
    setText(next);
    setPreview(null);
    setCommitted(null);
    setError(null);
    setBusy(null);
    commitAttempt.current = null;
  }, []);

  useEffect(() => () => {
    requestVersion.current += 1;
    activeRequest.current?.abort();
  }, []);

  const run = useCallback(async (dryRun: boolean) => {
    if (text.trim() === '') {
      setError('Dán nội dung CSV trước khi kiểm tra.');
      return;
    }
    if (!dryRun && (!preview || preview.file !== text || preview.result.rejected > 0 || preview.result.created + preview.result.attached === 0)) {
      setError('Nội dung hiện tại chưa có kết quả kiểm tra hợp lệ. Hãy kiểm tra lại trước khi ghi.');
      return;
    }
    activeRequest.current?.abort();
    const controller = new AbortController();
    const version = requestVersion.current + 1;
    requestVersion.current = version;
    activeRequest.current = controller;
    const submittedText = text;
    setBusy(dryRun ? 'dry' : 'commit');
    setError(null);
    if (dryRun) {
      setPreview(null);
      setCommitted(null);
    }
    try {
      if (!dryRun && (!commitAttempt.current || commitAttempt.current.file !== submittedText)) {
        commitAttempt.current = { file: submittedText, key: newIdempotencyKey('product-import') };
      }
      const result = await importProducts(submittedText, dryRun, dryRun ? undefined : commitAttempt.current!.key, controller.signal);
      if (controller.signal.aborted || requestVersion.current !== version) return;
      if (dryRun) {
        setPreview({ file: submittedText, result });
        setCommitted(null);
      } else {
        setCommitted(result);
        setPreview(null);
        onCommitted?.();
      }
    } catch (cause) {
      if (controller.signal.aborted || requestVersion.current !== version) return;
      setError(cause instanceof Error ? cause.message : 'Không nhập được danh mục.');
    } finally {
      if (requestVersion.current === version) {
        activeRequest.current = null;
        setBusy(null);
      }
    }
  }, [onCommitted, preview, text]);

  return (
    <section aria-label="Nhập danh mục bằng CSV" className="grid gap-4 rounded-card border border-line bg-white p-5">
      <div>
        <h2 className="font-display text-lg font-bold text-on-surface">Nhập danh mục bằng CSV</h2>
        <p className="mt-1 font-body text-body-sm text-graphite">
          Kiểm tra trước, ghi sau. Chỉ cần một dòng bị từ chối thì <strong>cả tệp không được ghi</strong>, để danh mục không bị nhập dở.
        </p>
        <p className="mt-1 font-body text-caption text-graphite">
          Sản phẩm mới luôn vào trạng thái <strong>Bản nháp</strong>, không bao giờ tự động đang bán. Biến thể nhập vào chưa có tồn kho, nên chưa bán được cho đến khi bạn nhập hàng.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="font-body text-caption font-semibold text-graphite underline"
          onClick={() => replaceText(template)}
        >
          Dùng mẫu CSV
        </button>
      </div>
      <textarea
        aria-label="Nội dung CSV"
        className="min-h-40 w-full rounded-control border border-line p-3 font-mono text-caption"
        value={text}
        placeholder={template}
        onChange={(event) => replaceText(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy !== null || !canWrite} title={!canWrite ? disabledReason : undefined} onClick={() => void run(true)}>
          {busy === 'dry' ? 'Đang kiểm tra…' : 'Kiểm tra (không ghi)'}
        </Button>
        {/* Disabled until a dry run has come back on THIS text. Without that, the commit button
            is a one-click path to a catalogue nobody has read. */}
        <Button
          size="sm"
          variant="secondary"
          disabled={!canWrite || busy !== null || !!committed || !preview || preview.file !== text || preview.result.rejected > 0 || preview.result.created + preview.result.attached === 0}
          title={!canWrite ? disabledReason : undefined}
          onClick={() => void run(false)}
        >
          {busy === 'commit' ? 'Đang ghi…' : 'Ghi vào danh mục'}
        </Button>
      </div>
      {error ? <p role="alert" className="font-body text-body-sm text-badge-blocked-text">{error}</p> : null}
      {preview ? (
        <div role="status" className="grid gap-2 rounded-control bg-surface-container-low p-3 font-body text-body-sm">
          <p className="text-on-surface">
            Kiểm tra xong: tạo mới <strong>{preview.result.created}</strong> · thêm biến thể <strong>{preview.result.attached}</strong> · không đổi <strong>{preview.result.unchanged}</strong> · bị từ chối <strong>{preview.result.rejected}</strong>.
          </p>
          {preview.result.rejected > 0 ? (
            <ul className="grid gap-1 text-badge-blocked-text">
              {preview.result.problems.map((problem) => (
                <li key={`${problem.row_number}-${problem.message}`}>
                  Dòng {problem.row_number}{problem.sku ? ` (${problem.sku})` : ''}: {problem.message}
                </li>
              ))}
            </ul>
          ) : null}
          {preview.result.rejected === 0 && preview.result.created + preview.result.attached === 0 ? (
            <p className="text-graphite">Không có gì để ghi — tệp đã khớp với danh mục hiện tại.</p>
          ) : null}
        </div>
      ) : null}
      {committed ? (
        <p role="status" className="font-body text-body-sm text-badge-progress-text">
          Đã ghi: {committed.created} sản phẩm mới, {committed.attached} biến thể, {committed.unchanged} dòng không đổi.
        </p>
      ) : null}
    </section>
  );
}
