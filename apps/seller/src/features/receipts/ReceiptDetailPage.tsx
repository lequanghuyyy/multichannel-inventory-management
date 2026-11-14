import { useEffect, useRef, useState } from 'react';
import { href, navigate } from '../../app/routes';
import { StatusBadge } from '../../components/common/StatusBadge';
import { ErrorState, LoadingState } from '../../components/common/ScreenState';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import {
  getReceipt,
  receiveReceipt,
  cancelReceipt,
  closeShortReceipt,
  updateReceipt,
  previewReceiveReceipt,
  listReceiptAudit,
  exportReceiptCsv,
  handleRejectionAction,
  uploadReceiptAttachment,
  deleteReceiptAttachment,
  getAttachmentDownloadUrl,
  type Receipt,
  type ReceivePreviewResult,
  type ReceiptAuditEntry,
  type ReceiptRejection,
  type ReceiptAttachment,
} from '../../api/receipts';
import { listInventory, type InventoryRow, getInventoryRowBySku } from '../../api/inventory';

const statusPresentation: Record<string, { label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' }> = {
  DRAFT: { label: 'Bản nháp', tone: 'neutral' },
  PARTIALLY_RECEIVED: { label: 'Nhận một phần', tone: 'warning' },
  RECEIVED: { label: 'Đã hoàn tất', tone: 'success' },
  CLOSED_SHORT: { label: 'Kết thúc sớm', tone: 'warning' },
  CANCELLED: { label: 'Đã hủy', tone: 'danger' },
};

const rejectionStatusPresentation: Record<string, { label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' }> = {
  PENDING: { label: 'Chờ xử lý', tone: 'warning' },
  REPLACEMENT_REQUESTED: { label: 'Đã yêu cầu bù', tone: 'neutral' },
  PARTIALLY_REPLACED: { label: 'Đã bù một phần', tone: 'warning' },
  RESOLVED: { label: 'Đã hoàn tất', tone: 'success' },
  RETURNED: { label: 'Đã trả NCC', tone: 'neutral' },
  CLOSED: { label: 'Đã đóng', tone: 'neutral' },
};

function formatTime(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatUnitCost(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'Chưa nhập';
  return `${new Intl.NumberFormat('vi-VN').format(value)} ₫`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface ReceiveFormLine {
  sku: string;
  acceptedQty: number;
  rejectedQty: number;
  rejectionReason: string;
}

interface EditDraftItem {
  sku: string;
  productName: string;
  expectedQuantity: number;
  unitCostMinor?: number;
}

export function ReceiptDetailPage({ id }: { id: string }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // Receiving state
  const [receiveLines, setReceiveLines] = useState<Record<string, ReceiveFormLine>>({});
  const [batchNote, setBatchNote] = useState('');
  const [submittingReceive, setSubmittingReceive] = useState(false);
  const [receiveError, setReceiveError] = useState<string | null>(null);
  const [receiveSuccess, setReceiveSuccess] = useState<string | null>(null);

  // Preview confirmation modal state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<ReceivePreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [isStaleInventory, setIsStaleInventory] = useState(false);

  // Draft editing state
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  const [editSupplierName, setEditSupplierName] = useState('');
  const [editReferenceNumber, setEditReferenceNumber] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editItems, setEditItems] = useState<EditDraftItem[]>([]);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  // New item input for draft edit mode
  const [newEditSku, setNewEditSku] = useState('');
  const [newEditQty, setNewEditQty] = useState(1);
  const [newEditUnitCost, setNewEditUnitCost] = useState('');

  // Catalog & Audit logs
  const [skuCatalog, setSkuCatalog] = useState<InventoryRow[]>([]);
  const [auditEntries, setAuditEntries] = useState<ReceiptAuditEntry[]>([]);

  // Cancel state
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [submittingCancel, setSubmittingCancel] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Close Short state (Yêu cầu 4)
  const [closeShortModalOpen, setCloseShortModalOpen] = useState(false);
  const [closeShortReason, setCloseShortReason] = useState('');
  const [submittingCloseShort, setSubmittingCloseShort] = useState(false);
  const [closeShortError, setCloseShortError] = useState<string | null>(null);

  // Rejection Discrepancies state (Yêu cầu 6)
  const [selectedRejection, setSelectedRejection] = useState<ReceiptRejection | null>(null);
  const [rejectionActionModalOpen, setRejectionActionModalOpen] = useState(false);
  const [rejectionActionType, setRejectionActionType] = useState<
    'REQUEST_REPLACEMENT' | 'RECEIVE_REPLACEMENT' | 'RETURN_SUPPLIER' | 'CLOSE_WITHOUT_REPLACEMENT'
  >('REQUEST_REPLACEMENT');
  const [rejectionActionQty, setRejectionActionQty] = useState<number>(1);
  const [rejectionAcceptedQty, setRejectionAcceptedQty] = useState<number>(0);
  const [rejectionRejectedQty, setRejectionRejectedQty] = useState<number>(0);
  const [rejectionActionReason, setRejectionActionReason] = useState<string>('');
  const [rejectionActionNote, setRejectionActionNote] = useState<string>('');
  const [submittingRejectionAction, setSubmittingRejectionAction] = useState(false);
  const [rejectionActionError, setRejectionActionError] = useState<string | null>(null);
  const [rejectionActionSuccess, setRejectionActionSuccess] = useState<string | null>(null);

  // Attachments state (Yêu cầu 8)
  const [attachmentModalOpen, setAttachmentModalOpen] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentDesc, setAttachmentDesc] = useState('');
  const [submittingAttachment, setSubmittingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<ReceiptAttachment | null>(null);

  // Export CSV state (Yêu cầu 7)
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Stable idempotency keys per intent
  const receiveKeyRef = useRef<string>(crypto.randomUUID());
  const resetReceiveKey = () => {
    receiveKeyRef.current = crypto.randomUUID();
  };

  const editKeyRef = useRef<string>(crypto.randomUUID());
  const resetEditKey = () => {
    editKeyRef.current = crypto.randomUUID();
  };

  const cancelKeyRef = useRef<string>(crypto.randomUUID());
  const resetCancelKey = () => {
    cancelKeyRef.current = crypto.randomUUID();
  };

  const closeShortKeyRef = useRef<string>(crypto.randomUUID());
  const resetCloseShortKey = () => {
    closeShortKeyRef.current = crypto.randomUUID();
  };

  const rejectionActionKeyRef = useRef<string>(crypto.randomUUID());
  const resetRejectionActionKey = () => {
    rejectionActionKeyRef.current = crypto.randomUUID();
  };

  const loadAuditLogs = async () => {
    try {
      const logs = await listReceiptAudit(id);
      setAuditEntries(Array.isArray(logs) ? logs : []);
    } catch {
      // Audit logs lookup failure is non-fatal
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getReceipt(id);
      setReceipt(res);

      // Initialize receive inputs for remaining items with 0 as default
      const initial: Record<string, ReceiveFormLine> = {};
      for (const item of res.items) {
        if (item.remaining_quantity > 0) {
          initial[item.sku] = {
            sku: item.sku,
            acceptedQty: 0,
            rejectedQty: 0,
            rejectionReason: '',
          };
        }
      }
      setReceiveLines(initial);
      resetReceiveKey();
      void loadAuditLogs();
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [id]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await listInventory({ limit: 100 });
        setSkuCatalog(res.items);
      } catch {
        // Catalogue lookup is an assistance tool
      }
    })();
  }, []);

  const handleReceiveLineChange = (sku: string, field: keyof ReceiveFormLine, value: unknown) => {
    resetReceiveKey();
    setReceiveLines((prev) => {
      const current = prev[sku] ?? { sku, acceptedQty: 0, rejectedQty: 0, rejectionReason: '' };
      return {
        ...prev,
        [sku]: {
          ...current,
          [field]: value,
        },
      };
    });
  };

  // Pre-receipt confirmation preview (Yêu cầu 2)
  const handleOpenReceivePreview = async (e: React.FormEvent) => {
    e.preventDefault();
    setReceiveError(null);
    setReceiveSuccess(null);
    setCommitError(null);
    setIsStaleInventory(false);

    const itemsToReceive = Object.values(receiveLines).filter(
      (line) => line.acceptedQty > 0 || line.rejectedQty > 0
    );

    if (itemsToReceive.length === 0) {
      setReceiveError('Vui lòng nhập số lượng nhận cho ít nhất một SKU.');
      return;
    }

    // Validate quantities against remaining
    for (const line of itemsToReceive) {
      const original = receipt?.items.find((it) => it.sku === line.sku);
      if (!original) continue;
      const sum = line.acceptedQty + line.rejectedQty;
      if (sum > original.remaining_quantity) {
        setReceiveError(
          `Tổng số lượng nhận (${sum}) cho SKU ${line.sku} vượt quá số lượng còn lại (${original.remaining_quantity}).`
        );
        return;
      }
      if (line.rejectedQty > 0 && !line.rejectionReason.trim()) {
        setReceiveError(`Vui lòng ghi rõ lý do từ chối cho SKU ${line.sku}.`);
        return;
      }
    }

    setPreviewModalOpen(true);
    await runPreview(itemsToReceive);
  };

  const runPreview = async (itemsToReceive?: ReceiveFormLine[]) => {
    const lines =
      itemsToReceive ||
      Object.values(receiveLines).filter((line) => line.acceptedQty > 0 || line.rejectedQty > 0);

    setPreviewLoading(true);
    setPreviewError(null);
    setCommitError(null);
    setIsStaleInventory(false);

    try {
      const res = await previewReceiveReceipt(id, {
        note: batchNote.trim() || undefined,
        items: lines.map((l) => ({
          sku: l.sku,
          accepted_quantity: l.acceptedQty,
          rejected_quantity: l.rejectedQty,
          rejection_reason: l.rejectionReason.trim() || undefined,
        })),
      });
      setPreviewResult(res);
      if (!res.valid && res.errors.length > 0) {
        setPreviewError(res.errors.join('; '));
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Không thể lấy thông tin xem trước tồn kho.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCommitReceive = async () => {
    if (!previewResult || !receipt) return;
    setSubmittingReceive(true);
    setCommitError(null);
    setIsStaleInventory(false);

    const key = receiveKeyRef.current;

    try {
      const updated = await receiveReceipt(
        id,
        {
          note: batchNote.trim() || undefined,
          items: previewResult.items.map((it) => ({
            sku: it.sku,
            accepted_quantity: it.accepted_quantity,
            rejected_quantity: it.rejected_quantity,
            rejection_reason: it.rejection_reason || undefined,
            expected_inventory_version: it.inventory_version,
          })),
        },
        key
      );

      setReceipt(updated);
      setPreviewModalOpen(false);
      setReceiveSuccess('Đã xác nhận nhận hàng và cập nhật tồn kho thành công.');

      // Reset receive inputs
      const refreshed: Record<string, ReceiveFormLine> = {};
      for (const item of updated.items) {
        if (item.remaining_quantity > 0) {
          refreshed[item.sku] = {
            sku: item.sku,
            acceptedQty: 0,
            rejectedQty: 0,
            rejectionReason: '',
          };
        }
      }
      setReceiveLines(refreshed);
      setBatchNote('');
      resetReceiveKey();
      void loadAuditLogs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi nhận hàng.';
      if (msg.includes('STALE_INVENTORY') || (err as { code?: string })?.code === 'STALE_INVENTORY') {
        setIsStaleInventory(true);
        setCommitError(
          'Tồn kho của một hoặc nhiều SKU đã thay đổi so với bản xem trước (STALE_INVENTORY). Vui lòng nhấn "Tải lại xem trước" để cập nhật số liệu mới nhất.'
        );
      } else {
        setCommitError(msg);
      }
    } finally {
      setSubmittingReceive(false);
    }
  };

  // Draft editing methods (Yêu cầu 3)
  const handleStartEdit = () => {
    if (!receipt) return;
    setEditSupplierName(receipt.supplier_name);
    setEditReferenceNumber(receipt.reference_number || '');
    setEditNote(receipt.note || '');
    setEditItems(
      receipt.items.map((it) => ({
        sku: it.sku,
        productName: it.product_name,
        expectedQuantity: it.expected_quantity,
        unitCostMinor: it.unit_cost_minor ?? undefined,
      }))
    );
    setEditError(null);
    setEditSuccess(null);
    resetEditKey();
    setIsEditingDraft(true);
  };

  const handleCancelEdit = () => {
    setIsEditingDraft(false);
    setEditError(null);
  };

  const handleAddEditItem = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSku = newEditSku.trim().toUpperCase();
    if (!cleanSku) return;
    if (newEditQty <= 0) {
      setEditError('Số lượng dự kiến phải lớn hơn 0.');
      return;
    }
    const costText = newEditUnitCost.trim();
    const costMinor = costText === '' ? undefined : Number(costText);
    if (costMinor !== undefined && (!/^\d+$/.test(costText) || !Number.isSafeInteger(costMinor) || costMinor < 0)) {
      setEditError('Đơn giá nhập phải là số nguyên VND không âm.');
      return;
    }

    const matched = skuCatalog.find((c) => c.sku.toUpperCase() === cleanSku);
    const existingIndex = editItems.findIndex((it) => it.sku.toUpperCase() === cleanSku);

    if (existingIndex >= 0) {
      if (editItems[existingIndex]?.unitCostMinor !== costMinor) {
        setEditError('SKU trùng lặp phải có cùng đơn giá nhập.');
        return;
      }
      setEditItems((prev) =>
        prev.map((it, idx) =>
          idx === existingIndex
            ? { ...it, expectedQuantity: it.expectedQuantity + newEditQty }
            : it
        )
      );
    } else {
      setEditItems((prev) => [
        ...prev,
        {
          sku: cleanSku,
          productName: matched?.product_name || cleanSku,
          expectedQuantity: newEditQty,
          unitCostMinor: costMinor,
        },
      ]);
    }

    setNewEditSku('');
    setNewEditQty(1);
    setNewEditUnitCost('');
    setEditError(null);
  };

  const handleRemoveEditItem = (sku: string) => {
    setEditItems((prev) => prev.filter((it) => it.sku !== sku));
  };

  const handleSaveDraftEdit = async () => {
    if (!receipt) return;
    if (!editSupplierName.trim()) {
      setEditError('Tên nhà cung cấp không được để trống.');
      return;
    }
    if (editItems.length === 0) {
      setEditError('Phiếu nhập phải có ít nhất một sản phẩm.');
      return;
    }

    setSubmittingEdit(true);
    setEditError(null);
    const key = editKeyRef.current;

    try {
      const updated = await updateReceipt(
        id,
        {
          supplier_name: editSupplierName.trim(),
          reference_number: editReferenceNumber.trim() || undefined,
          note: editNote.trim() || undefined,
          expected_version: receipt.version,
          items: editItems.map((it) => ({
            sku: it.sku,
            expected_quantity: it.expectedQuantity,
            unit_cost_minor: it.unitCostMinor,
          })),
        },
        key
      );

      setReceipt(updated);
      setIsEditingDraft(false);
      setEditSuccess('Cập nhật phiếu nhập nháp thành công.');
      resetEditKey();
      void loadAuditLogs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi cập nhật phiếu.';
      if (msg.includes('STALE_RECEIPT') || (err as { code?: string })?.code === 'STALE_RECEIPT') {
        setEditError(
          'Phiếu đã được chỉnh sửa bởi người dùng khác (STALE_RECEIPT). Vui lòng tải lại trang để xem nội dung mới nhất.'
        );
      } else {
        setEditError(msg);
      }
    } finally {
      setSubmittingEdit(false);
    }
  };

  // Close Short (Yêu cầu 4)
  const handleOpenCloseShortModal = () => {
    setCloseShortReason('');
    setCloseShortError(null);
    resetCloseShortKey();
    setCloseShortModalOpen(true);
  };

  const handleConfirmCloseShort = async () => {
    if (!receipt) return;
    if (!closeShortReason.trim()) {
      setCloseShortError('Vui lòng nhập lý do kết thúc sớm phiếu nhập.');
      return;
    }

    setSubmittingCloseShort(true);
    setCloseShortError(null);
    const key = closeShortKeyRef.current;

    try {
      const updated = await closeShortReceipt(
        id,
        {
          reason: closeShortReason.trim(),
          expected_version: receipt.version,
        },
        key
      );
      setReceipt(updated);
      setCloseShortModalOpen(false);
      resetCloseShortKey();
      void loadAuditLogs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi kết thúc sớm phiếu nhập.';
      if (msg.includes('STALE_RECEIPT') || (err as { code?: string })?.code === 'STALE_RECEIPT') {
        setCloseShortError(
          'Phiếu đã được thay đổi phiên bản (STALE_RECEIPT). Vui lòng đóng cửa sổ và tải lại trang.'
        );
      } else {
        setCloseShortError(msg);
      }
    } finally {
      setSubmittingCloseShort(false);
    }
  };

  // Cancel receipt
  const handleCancelReceipt = async () => {
    if (!receipt) return;
    if (!cancelReason.trim()) {
      setCancelError('Vui lòng nhập lý do hủy phiếu.');
      return;
    }

    setSubmittingCancel(true);
    setCancelError(null);
    const key = cancelKeyRef.current;

    try {
      const updated = await cancelReceipt(id, { reason: cancelReason.trim() }, key);
      setReceipt(updated);
      setCancelModalOpen(false);
      resetCancelKey();
      void loadAuditLogs();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Lỗi khi hủy phiếu.');
    } finally {
      setSubmittingCancel(false);
    }
  };

  // Export CSV (Yêu cầu 7)
  const handleExportCsv = async () => {
    if (!receipt) return;
    setExportingCsv(true);
    setExportError(null);
    try {
      const blob = await exportReceiptCsv(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Phieu-nhap-${receipt.receipt_number}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Xuất CSV thất bại.');
    } finally {
      setExportingCsv(false);
    }
  };

  // Print (Yêu cầu 7)
  const handlePrint = () => {
    window.print();
  };

  // Rejection Resolution (Yêu cầu 6)
  const handleOpenRejectionAction = (rejection: ReceiptRejection) => {
    setSelectedRejection(rejection);
    setRejectionActionType('REQUEST_REPLACEMENT');
    setRejectionActionQty(Math.max(1, rejection.unresolved_quantity));
    setRejectionAcceptedQty(0);
    setRejectionRejectedQty(0);
    setRejectionActionReason('');
    setRejectionActionNote('');
    setRejectionActionError(null);
    setRejectionActionSuccess(null);
    resetRejectionActionKey();
    setRejectionActionModalOpen(true);
  };

  const handleConfirmRejectionAction = async () => {
    if (!receipt || !selectedRejection) return;
    setSubmittingRejectionAction(true);
    setRejectionActionError(null);

    const key = rejectionActionKeyRef.current;

    try {
      let expectedVersion: number | undefined;
      if (rejectionActionType === 'RECEIVE_REPLACEMENT' && rejectionAcceptedQty > 0) {
        // Fetch current inventory balance version for optimistic concurrency
        try {
          const inv = await getInventoryRowBySku(selectedRejection.sku);
          expectedVersion = inv.version;
        } catch {
          // If inventory not found or unreachable, let backend validate
        }
      }

      await handleRejectionAction(
        id,
        selectedRejection.id,
        {
          action_type: rejectionActionType,
          quantity: rejectionActionType === 'RECEIVE_REPLACEMENT'
            ? rejectionAcceptedQty + rejectionRejectedQty
            : rejectionActionQty,
          accepted_quantity: rejectionActionType === 'RECEIVE_REPLACEMENT' ? rejectionAcceptedQty : undefined,
          rejected_quantity: rejectionActionType === 'RECEIVE_REPLACEMENT' ? rejectionRejectedQty : undefined,
          rejection_reason: rejectionActionType === 'RECEIVE_REPLACEMENT' && rejectionRejectedQty > 0
            ? rejectionActionReason.trim()
            : undefined,
          note: rejectionActionNote.trim() || undefined,
          expected_inventory_version: expectedVersion,
        },
        key
      );

      setRejectionActionModalOpen(false);
      setRejectionActionSuccess('Đã cập nhật xử lý chênh lệch hàng lỗi thành công.');
      resetRejectionActionKey();
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi xử lý hàng lỗi.';
      setRejectionActionError(msg);
    } finally {
      setSubmittingRejectionAction(false);
    }
  };

  // Attachment upload (Yêu cầu 8)
  const handleUploadAttachment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attachmentFile) {
      setAttachmentError('Vui lòng chọn tệp để tải lên.');
      return;
    }
    if (attachmentFile.size > 10 * 1024 * 1024) {
      setAttachmentError('Dung lượng tệp vượt quá giới hạn cho phép (tối đa 10MB).');
      return;
    }
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowed.includes(attachmentFile.type)) {
      setAttachmentError('Định dạng tệp không được hỗ trợ. Chỉ chấp nhận PDF, JPEG, PNG.');
      return;
    }

    setSubmittingAttachment(true);
    setAttachmentError(null);

    try {
      await uploadReceiptAttachment(id, attachmentFile, attachmentDesc.trim() || undefined);
      setAttachmentModalOpen(false);
      setAttachmentFile(null);
      setAttachmentDesc('');
      await loadData();
    } catch (err) {
      setAttachmentError(err instanceof Error ? err.message : 'Tải lên tài liệu thất bại.');
    } finally {
      setSubmittingAttachment(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa tài liệu chứng từ này?')) return;
    try {
      await deleteReceiptAttachment(id, attachmentId);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Xóa tài liệu thất bại.');
    }
  };

  if (loading) return <LoadingState label="Đang tải chi tiết phiếu nhập…" />;
  if (error || !receipt) return <ErrorState error={error} retry={() => void loadData()} />;

  const status = statusPresentation[receipt.status] ?? { label: receipt.status, tone: 'neutral' };
  const canReceive = receipt.status === 'DRAFT' || receipt.status === 'PARTIALLY_RECEIVED';
  const canCancel = receipt.status === 'DRAFT';
  const canCloseShort = receipt.status === 'PARTIALLY_RECEIVED';
  const canEditDraft = receipt.status === 'DRAFT' && receipt.total_received === 0;

  const totalAcceptedInForm = Object.values(receiveLines).reduce((acc, l) => acc + (l.acceptedQty || 0), 0);
  const totalRejectedInForm = Object.values(receiveLines).reduce((acc, l) => acc + (l.rejectedQty || 0), 0);

  const inspectedTotal = receipt.total_inspected ?? ((receipt.total_accepted || 0) + (receipt.total_rejected || 0));
  const acceptedTotal = receipt.total_accepted ?? receipt.total_received;
  const rejectedTotal = receipt.total_rejected ?? 0;
  const replacedTotal = receipt.items.reduce((acc, it) => acc + (it.replaced_quantity || 0), 0);
  const remainingTotal = receipt.total_remaining ?? Math.max(0, receipt.total_expected - receipt.total_received);

  return (
    <>
      {/* Printable A4 Layout for window.print() (Yêu cầu 7) */}
      <div className="hidden print:block font-body text-black bg-white p-6 max-w-[210mm] mx-auto">
        {receipt.status === 'DRAFT' ? (
          <div className="fixed inset-0 flex items-center justify-center opacity-10 pointer-events-none select-none z-0">
            <span className="text-[100px] font-bold text-gray-700 uppercase -rotate-45">BẢN NHÁP</span>
          </div>
        ) : null}

        <div className="relative z-10">
          <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-6">
            <div>
              <h1 className="text-xl font-bold tracking-tight">HỆ THỐNG BÁN HÀNG ĐA KÊNH DATT</h1>
              <p className="text-xs text-gray-600">Đơn vị quản lý tồn kho và chuỗi cung ứng</p>
            </div>
            <div className="text-right">
              <h2 className="text-2xl font-bold uppercase tracking-wider">PHIẾU NHẬP KHO</h2>
              <p className="text-sm font-mono font-bold mt-1">Số: {receipt.receipt_number}</p>
              <p className="text-xs text-gray-600">Ngày lập: {formatTime(receipt.created_at)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs mb-6 border border-gray-300 p-4 rounded">
            <div>
              <p><strong>Nhà cung cấp:</strong> {receipt.supplier_name}</p>
              <p><strong>Số chứng từ tham chiếu:</strong> {receipt.reference_number || '—'}</p>
              <p><strong>Người tạo phiếu:</strong> {receipt.created_by_email}</p>
            </div>
            <div>
              <p><strong>Trạng thái:</strong> {status.label}</p>
              <p><strong>Thời gian nhận gần nhất:</strong> {formatTime(receipt.received_at)}</p>
              {receipt.closed_short_reason ? (
                <p><strong>Lý do kết thúc sớm:</strong> {receipt.closed_short_reason}</p>
              ) : null}
              {receipt.note ? <p><strong>Ghi chú:</strong> {receipt.note}</p> : null}
            </div>
          </div>

          <table className="w-full text-xs border border-collapse border-black mb-8">
            <thead>
              <tr className="bg-gray-100 border-b border-black text-center font-bold">
                <th className="border border-black p-2 w-10">STT</th>
                <th className="border border-black p-2 text-left">Mã SKU</th>
                <th className="border border-black p-2 text-left">Tên sản phẩm</th>
                <th className="border border-black p-2 text-right">Dự kiến</th>
                <th className="border border-black p-2 text-right">Đã nhận</th>
                <th className="border border-black p-2 text-right">Đạt chuẩn</th>
                <th className="border border-black p-2 text-right">Từ chối</th>
                <th className="border border-black p-2 text-right">Đơn giá</th>
                <th className="border border-black p-2 text-right">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {receipt.items.map((it, idx) => {
                const cost = it.unit_cost_minor || 0;
                const totalCost = cost * it.accepted_quantity;
                return (
                  <tr key={it.id} className="border-b border-gray-300">
                    <td className="border border-black p-2 text-center">{idx + 1}</td>
                    <td className="border border-black p-2 font-mono font-bold">{it.sku}</td>
                    <td className="border border-black p-2">{it.product_name}</td>
                    <td className="border border-black p-2 text-right">{it.expected_quantity}</td>
                    <td className="border border-black p-2 text-right">{it.received_quantity}</td>
                    <td className="border border-black p-2 text-right font-bold">{it.accepted_quantity}</td>
                    <td className="border border-black p-2 text-right">{it.rejected_quantity}</td>
                    <td className="border border-black p-2 text-right">{cost > 0 ? formatUnitCost(cost) : '—'}</td>
                    <td className="border border-black p-2 text-right font-bold">{cost > 0 ? formatUnitCost(totalCost) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-bold bg-gray-50 border-t-2 border-black">
                <td colSpan={3} className="border border-black p-2 text-center">TỔNG CỘNG</td>
                <td className="border border-black p-2 text-right">{receipt.total_expected}</td>
                <td className="border border-black p-2 text-right">{receipt.total_received}</td>
                <td className="border border-black p-2 text-right">{acceptedTotal}</td>
                <td className="border border-black p-2 text-right">{rejectedTotal}</td>
                <td colSpan={2} className="border border-black p-2 text-right">
                  {formatUnitCost(receipt.items.reduce((acc, it) => acc + ((it.unit_cost_minor || 0) * it.accepted_quantity), 0))}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Signature blocks (Yêu cầu 7) */}
          <div className="grid grid-cols-4 gap-4 text-center text-xs mt-12 pt-6">
            <div>
              <p className="font-bold uppercase">Người lập phiếu</p>
              <p className="text-[10px] text-gray-500 italic mt-0.5">(Ký, ghi rõ họ tên)</p>
              <div className="h-20" />
              <p className="font-semibold">{receipt.created_by_email}</p>
            </div>
            <div>
              <p className="font-bold uppercase">Người giao hàng</p>
              <p className="text-[10px] text-gray-500 italic mt-0.5">(Ký, ghi rõ họ tên)</p>
              <div className="h-20" />
              <p className="text-gray-400">..............................</p>
            </div>
            <div>
              <p className="font-bold uppercase">Thủ kho / Người nhận</p>
              <p className="text-[10px] text-gray-500 italic mt-0.5">(Ký, ghi rõ họ tên)</p>
              <div className="h-20" />
              <p className="text-gray-400">..............................</p>
            </div>
            <div>
              <p className="font-bold uppercase">Kế toán / Phụ trách</p>
              <p className="text-[10px] text-gray-500 italic mt-0.5">(Ký, ghi rõ họ tên)</p>
              <div className="h-20" />
              <p className="text-gray-400">..............................</p>
            </div>
          </div>
        </div>
      </div>

      {/* Screen Interactive UI (no-print) */}
      <section className="print:hidden mx-auto flex w-full max-w-[1150px] flex-col gap-6 py-7 sm:gap-7 sm:py-8">
        <header className="relative rounded-lg border border-metric-ink bg-channel-paper p-5 shadow-metric sm:p-7">
          <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 rounded-l-lg bg-channel-accent" />
          <Button variant="ghost" onClick={() => navigate(href({ name: 'receipts' }))} className="mb-3 self-start">
            ← Danh sách phiếu nhập
          </Button>
          <p className="mb-1 font-body text-caption font-bold uppercase tracking-[0.14em] text-channel-accent">
            Kho · Chi tiết phiếu
          </p>
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="break-all font-display text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-[1.05] tracking-[-0.035em] text-on-surface">
                  {receipt.receipt_number}
                </h1>
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                <span className="rounded bg-surface-container-low px-2 py-0.5 font-mono text-caption text-graphite border border-outline-variant/40">
                  v{receipt.version}
                </span>
              </div>
              <p className="mt-3 font-body text-body-sm leading-6 text-graphite">
                Nhà cung cấp: <strong className="text-on-surface">{receipt.supplier_name}</strong>
                {receipt.reference_number ? ` · Số tham chiếu: ${receipt.reference_number}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canEditDraft && !isEditingDraft ? (
                <Button
                  variant="secondary"
                  leadingIcon={<span className="material-symbols-outlined text-base" aria-hidden="true">edit</span>}
                  onClick={handleStartEdit}
                >
                  Chỉnh sửa phiếu
                </Button>
              ) : null}

              {canCloseShort && !isEditingDraft ? (
                <Button
                  variant="secondary"
                  className="border-warning text-warning hover:bg-warning/10"
                  leadingIcon={<span className="material-symbols-outlined text-base" aria-hidden="true">check_box</span>}
                  onClick={handleOpenCloseShortModal}
                >
                  Kết thúc sớm
                </Button>
              ) : null}

              {canCancel && !isEditingDraft ? (
                <Button variant="secondary" onClick={() => setCancelModalOpen(true)}>
                  Hủy phiếu
                </Button>
              ) : null}

              <Button
                variant="secondary"
                size="sm"
                leadingIcon={<span className="material-symbols-outlined text-base" aria-hidden="true">print</span>}
                onClick={handlePrint}
              >
                In phiếu
              </Button>

              <Button
                variant="secondary"
                size="sm"
                loading={exportingCsv}
                leadingIcon={<span className="material-symbols-outlined text-base" aria-hidden="true">download</span>}
                onClick={() => void handleExportCsv()}
              >
                Xuất CSV
              </Button>

              <Button
                variant="secondary"
                size="sm"
                leadingIcon={<span className="material-symbols-outlined text-base" aria-hidden="true">refresh</span>}
                onClick={() => void loadData()}
              >
                Làm mới
              </Button>
            </div>
          </div>
        </header>

        {receiveSuccess ? (
          <aside className="rounded-control bg-badge-progress-bg p-4 font-body text-body-sm text-badge-progress-text" role="status">
            ✓ {receiveSuccess}
          </aside>
        ) : null}

        {editSuccess ? (
          <aside className="rounded-control bg-badge-progress-bg p-4 font-body text-body-sm text-badge-progress-text">
            ✓ {editSuccess}
          </aside>
        ) : null}

        {rejectionActionSuccess ? (
          <aside className="rounded-control bg-badge-progress-bg p-4 font-body text-body-sm text-badge-progress-text">
            ✓ {rejectionActionSuccess}
          </aside>
        ) : null}

        {exportError ? (
          <aside className="rounded-control bg-error-container p-4 font-body text-body-sm text-on-error-container">
            <strong>Lỗi xuất CSV:</strong> {exportError}
          </aside>
        ) : null}

        {receipt.status === 'CANCELLED' ? (
          <aside className="rounded-control bg-error-container p-4 font-body text-body-sm text-on-error-container">
            <strong>Phiếu đã bị hủy:</strong> {receipt.cancelled_reason}
          </aside>
        ) : null}

        {receipt.status === 'CLOSED_SHORT' ? (
          <aside className="rounded-control bg-warning/15 border border-warning/40 p-4 font-body text-body-sm text-on-surface">
            <div className="flex items-center gap-2 font-bold text-warning">
              <span className="material-symbols-outlined text-lg" aria-hidden="true">warning</span>
              <span>Phiếu đã kết thúc sớm (Closed Short)</span>
            </div>
            <p className="mt-1">
              <strong>Lý do:</strong> {receipt.closed_short_reason || 'Không có lý do cụ thể'}
            </p>
            <p className="text-caption text-graphite mt-0.5">
              Thực hiện bởi: {receipt.closed_short_by_email || '—'} · Thời gian: {formatTime(receipt.closed_short_at)}
            </p>
          </aside>
        ) : null}

        {/* Distinct Quantity Concepts Summary Cards (Yêu cầu 5) */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Card className="p-4 bg-channel-paper border-sandstone">
            <span className="text-[11px] font-bold uppercase tracking-wider text-graphite block">1. Dự kiến</span>
            <span className="text-xl font-mono font-bold text-on-surface mt-1 block tabular-nums">
              {receipt.total_expected}
            </span>
            <span className="text-[11px] text-graphite">Tổng theo đơn đặt</span>
          </Card>

          <Card className="p-4 bg-channel-paper border-sandstone">
            <span className="text-[11px] font-bold uppercase tracking-wider text-graphite block">2. Đã kiểm</span>
            <span className="text-xl font-mono font-bold text-on-surface mt-1 block tabular-nums">
              {inspectedTotal}
            </span>
            <span className="text-[11px] text-graphite">Đạt + Từ chối</span>
          </Card>

          <Card className="p-4 bg-channel-paper border-sandstone">
            <span className="text-[11px] font-bold uppercase tracking-wider text-badge-progress-text block">3. Đạt chuẩn (+Kho)</span>
            <span className="text-xl font-mono font-bold text-badge-progress-text mt-1 block tabular-nums">
              {acceptedTotal}
            </span>
            <span className="text-[11px] text-graphite">Đã tăng On-Hand</span>
          </Card>

          <Card className="p-4 bg-channel-paper border-sandstone">
            <span className="text-[11px] font-bold uppercase tracking-wider text-error block">4. Hàng lỗi/Từ chối</span>
            <span className="text-xl font-mono font-bold text-error mt-1 block tabular-nums">
              {rejectedTotal}
            </span>
            <span className="text-[11px] text-graphite">Không tăng On-Hand</span>
          </Card>

          <Card className="p-4 bg-channel-paper border-sandstone">
            <span className="text-[11px] font-bold uppercase tracking-wider text-channel-accent block">5. Đã giao bù</span>
            <span className="text-xl font-mono font-bold text-channel-accent mt-1 block tabular-nums">
              {replacedTotal}
            </span>
            <span className="text-[11px] text-graphite">Hàng bù đã đạt chuẩn</span>
          </Card>

          <Card className="p-4 bg-channel-paper border-sandstone">
            <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface block">
              {receipt.status === 'CLOSED_SHORT' ? '6. Thiếu (Short)' : '6. Còn lại'}
            </span>
            <span className="text-xl font-mono font-bold text-on-surface mt-1 block tabular-nums">
              {remainingTotal}
            </span>
            <span className="text-[11px] text-graphite">
              {receipt.status === 'CLOSED_SHORT' ? 'Không nhận thêm' : 'Chờ giao tiếp'}
            </span>
          </Card>
        </div>

        {/* Edit Mode Panel (Yêu cầu 3) */}
        {isEditingDraft ? (
          <Card className="grid gap-5 border border-metric-ink bg-channel-paper p-5 shadow-metric ring-0 sm:p-6">
            <div className="flex flex-col justify-between gap-3 border-b border-dashed border-sandstone pb-4 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-xl text-channel-accent" aria-hidden="true">
                    edit_document
                  </span>
                  <h2 className="font-display text-lg font-bold text-on-surface">Chỉnh sửa phiếu nhập (Bản nháp)</h2>
                </div>
                <p className="mt-1 font-body text-caption text-graphite">
                  Số phiếu <strong>{receipt.receipt_number}</strong> và người tạo{' '}
                  <strong>{receipt.created_by_email}</strong> được bảo toàn bất biến.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={handleCancelEdit} disabled={submittingEdit}>
                  Hủy chỉnh sửa
                </Button>
                <Button
                  onClick={() => void handleSaveDraftEdit()}
                  loading={submittingEdit}
                  leadingIcon={<span className="material-symbols-outlined text-base" aria-hidden="true">save</span>}
                >
                  Lưu thay đổi
                </Button>
              </div>
            </div>

            {editError ? (
              <div className="rounded-control bg-error-container p-3.5 font-body text-body-sm text-on-error-container">
                <strong>Lỗi:</strong> {editError}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Nhà cung cấp *"
                required
                value={editSupplierName}
                onChange={(e) => setEditSupplierName(e.target.value)}
              />
              <Input
                label="Số chứng từ tham chiếu (Hóa đơn/PO)"
                placeholder="VD: PO-2026-001"
                value={editReferenceNumber}
                onChange={(e) => setEditReferenceNumber(e.target.value)}
              />
              <div className="sm:col-span-2">
                <Input
                  label="Ghi chú"
                  placeholder="Ghi chú thêm về lô hàng…"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                />
              </div>
            </div>

            <div className="border-t border-outline-variant/60 pt-4">
              <h3 className="font-display text-base font-bold text-on-surface mb-3">Danh sách sản phẩm trong bản nháp</h3>
              <form onSubmit={handleAddEditItem} className="mb-4 grid items-end gap-3 rounded-control bg-surface-container-low p-3 sm:grid-cols-[1fr_120px_160px_auto]">
                <Input
                  label="Thêm SKU"
                  placeholder="Nhập hoặc chọn SKU"
                  value={newEditSku}
                  onChange={(e) => setNewEditSku(e.target.value)}
                />
                <Input
                  label="Số lượng"
                  type="number"
                  min="1"
                  value={newEditQty}
                  onChange={(e) => setNewEditQty(Math.max(1, parseInt(e.target.value) || 1))}
                />
                <Input
                  label="Đơn giá (₫)"
                  placeholder="Tùy chọn"
                  value={newEditUnitCost}
                  onChange={(e) => setNewEditUnitCost(e.target.value)}
                />
                <Button type="submit" variant="secondary" size="sm">
                  Thêm dòng
                </Button>
              </form>

              <div className="overflow-x-auto rounded-control border border-outline-variant/60">
                <table className="w-full border-collapse text-left font-body text-caption">
                  <thead>
                    <tr className="bg-surface-container-low font-semibold uppercase text-graphite">
                      <th className="py-2.5 px-3">SKU</th>
                      <th className="py-2.5 px-3">Tên sản phẩm</th>
                      <th className="py-2.5 px-3 text-right">Dự kiến</th>
                      <th className="py-2.5 px-3 text-right">Đơn giá</th>
                      <th className="py-2.5 px-3 text-center w-16">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container">
                    {editItems.map((item) => (
                      <tr key={item.sku}>
                        <td className="py-2.5 px-3 font-mono font-bold text-on-surface">{item.sku}</td>
                        <td className="py-2.5 px-3 text-on-surface">{item.productName}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums text-on-surface">
                          {item.expectedQuantity}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-graphite">
                          {formatUnitCost(item.unitCostMinor)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveEditItem(item.sku)}
                            className="text-error hover:underline text-caption font-semibold"
                          >
                            Xóa
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        ) : null}

        {/* Receipt Details & Items Table (Yêu cầu 5) */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Metadata Card */}
          <Card className="grid grid-cols-2 gap-4 content-start p-5 sm:grid-cols-2 lg:order-2">
            <div>
              <span className="font-body text-caption font-bold uppercase tracking-wider text-graphite">Ngày tạo</span>
              <p className="mt-1 font-body text-body-sm font-semibold text-on-surface">{formatTime(receipt.created_at)}</p>
            </div>
            <div>
              <span className="font-body text-caption font-bold uppercase tracking-wider text-graphite">Người tạo</span>
              <p className="mt-1 font-body text-body-sm font-semibold text-on-surface">{receipt.created_by_email || '—'}</p>
            </div>
            <div>
              <span className="font-body text-caption font-bold uppercase tracking-wider text-graphite">Dòng hàng</span>
              <p className="mt-1 font-mono text-body-sm font-bold text-on-surface">{receipt.item_count} SKU</p>
            </div>
            <div>
              <span className="font-body text-caption font-bold uppercase tracking-wider text-graphite">Lần nhận gần nhất</span>
              <p className="mt-1 font-body text-body-sm font-semibold text-on-surface">{formatTime(receipt.received_at)}</p>
            </div>
            {receipt.note ? (
              <div className="col-span-full border-t border-outline-variant/40 pt-3">
                <span className="font-body text-caption font-bold uppercase tracking-wider text-graphite">Ghi chú</span>
                <p className="mt-1 font-body text-body-sm text-on-surface">{receipt.note}</p>
              </div>
            ) : null}
          </Card>

          {/* Items list with all 7 quantity concepts (Yêu cầu 5) */}
          <Card className="overflow-hidden p-0 lg:order-1">
            <header className="border-b border-outline-variant/50 px-5 py-4">
              <h2 className="font-display text-lg font-bold text-on-surface">Danh sách sản phẩm trong phiếu</h2>
              <p className="mt-0.5 font-body text-caption text-graphite">
                Theo dõi chi tiết số lượng dự kiến, đã kiểm, đạt chuẩn, từ chối, giao bù và còn lại.
              </p>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left font-body text-caption">
                <thead>
                  <tr className="bg-surface-container-low font-semibold uppercase tracking-wider text-graphite">
                    <th className="py-3 px-3">SKU & Sản phẩm</th>
                    <th className="py-3 px-2 text-right">Đơn giá</th>
                    <th className="py-3 px-2 text-right">Dự kiến</th>
                    <th className="py-3 px-2 text-right">Đã kiểm</th>
                    <th className="py-3 px-2 text-right text-badge-progress-text">Đạt (+Kho)</th>
                    <th className="py-3 px-2 text-right text-error">Lỗi</th>
                    <th className="py-3 px-2 text-right text-channel-accent">Giao bù</th>
                    <th className="py-3 px-3 text-right">
                      {receipt.status === 'CLOSED_SHORT' ? 'Thiếu (Short)' : 'Còn lại'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container">
                  {receipt.items.map((item) => {
                    const inspected = item.inspected_quantity ?? (item.accepted_quantity + item.rejected_quantity);
                    const remainingOrShort = receipt.status === 'CLOSED_SHORT'
                      ? (item.short_quantity ?? item.remaining_quantity)
                      : item.remaining_quantity;

                    return (
                      <tr key={item.id} className="hover:bg-surface-container-low/50">
                        <td className="py-3 px-3">
                          <code className="font-mono text-caption font-bold text-on-surface">{item.sku}</code>
                          <span className="block text-[11px] text-graphite">{item.product_name}</span>
                        </td>
                        <td className="py-3 px-2 text-right font-mono tabular-nums text-graphite">
                          {formatUnitCost(item.unit_cost_minor)}
                        </td>
                        <td className="py-3 px-2 text-right font-mono font-bold tabular-nums text-on-surface">
                          {item.expected_quantity}
                        </td>
                        <td className="py-3 px-2 text-right font-mono tabular-nums text-on-surface">
                          {inspected}
                        </td>
                        <td className="py-3 px-2 text-right font-mono font-bold tabular-nums text-badge-progress-text">
                          +{item.accepted_quantity}
                        </td>
                        <td className="py-3 px-2 text-right font-mono font-bold tabular-nums text-error">
                          {item.rejected_quantity}
                        </td>
                        <td className="py-3 px-2 text-right font-mono font-bold tabular-nums text-channel-accent">
                          {item.replaced_quantity || 0}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold tabular-nums text-on-surface">
                          <span
                            className={
                              remainingOrShort === 0
                                ? 'text-graphite'
                                : receipt.status === 'CLOSED_SHORT'
                                ? 'text-error font-bold'
                                : 'text-on-surface'
                            }
                          >
                            {remainingOrShort}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Receive Goods section */}
        {canReceive && !isEditingDraft ? (
          <Card className="grid gap-5 border border-metric-ink bg-pure-white p-5 shadow-metric ring-0 sm:p-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-xl text-primary" aria-hidden="true">
                  archive
                </span>
                <h2 className="font-display text-lg font-bold text-on-surface">Ghi nhận đợt nhận hàng thực tế</h2>
              </div>
              <p className="mt-1 font-body text-body-sm text-graphite">
                Kiểm đếm số lượng thực tế khi xe giao tới.{' '}
                <strong>Chỉ số lượng chấp nhận mới làm tăng tồn kho</strong>. Hàng hỏng hoặc sai quy cách hãy nhập vào
                ô từ chối kèm lý do.
              </p>
            </div>

            {receiveError ? (
              <div className="rounded-control bg-error-container p-4 font-body text-body-sm text-on-error-container" role="alert">
                <strong>Lỗi:</strong> {receiveError}
              </div>
            ) : null}

            <form onSubmit={handleOpenReceivePreview} className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left font-body text-body-sm">
                  <thead>
                    <tr className="border-b border-outline-variant/60 text-caption font-semibold uppercase tracking-wider text-graphite">
                      <th className="py-2.5 px-3">SKU</th>
                      <th className="py-2.5 px-3 text-right">Còn lại</th>
                      <th className="py-2.5 px-3 text-right w-36">Chấp nhận (+Tồn)</th>
                      <th className="py-2.5 px-3 text-right w-36">Từ chối (Hỏng)</th>
                      <th className="py-2.5 px-3">Lý do từ chối (nếu có)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container">
                    {receipt.items.map((item) => {
                      const line = receiveLines[item.sku] ?? {
                        sku: item.sku,
                        acceptedQty: 0,
                        rejectedQty: 0,
                        rejectionReason: '',
                      };
                      const isFullyDone = item.remaining_quantity === 0;

                      return (
                        <tr key={item.id} className={isFullyDone ? 'opacity-40' : undefined}>
                          <td className="py-3 px-3">
                            <code className="font-mono text-caption font-bold text-on-surface">{item.sku}</code>
                            <span className="block text-caption text-graphite">{item.product_name}</span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold tabular-nums text-on-surface">
                            {item.remaining_quantity}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <input
                              type="number"
                              min="0"
                              max={item.remaining_quantity}
                              disabled={isFullyDone || submittingReceive}
                              className="min-h-10 w-full rounded-control border border-outline-variant bg-pure-white px-2 text-right font-mono text-sm text-badge-progress-text font-bold focus:border-carbon focus:outline-none"
                              value={line.acceptedQty}
                              onChange={(e) =>
                                handleReceiveLineChange(item.sku, 'acceptedQty', Math.max(0, parseInt(e.target.value) || 0))
                              }
                            />
                          </td>
                          <td className="py-3 px-3 text-right">
                            <input
                              type="number"
                              min="0"
                              max={item.remaining_quantity}
                              disabled={isFullyDone || submittingReceive}
                              className="min-h-10 w-full rounded-control border border-outline-variant bg-pure-white px-2 text-right font-mono text-sm text-error font-bold focus:border-carbon focus:outline-none"
                              value={line.rejectedQty}
                              onChange={(e) =>
                                handleReceiveLineChange(item.sku, 'rejectedQty', Math.max(0, parseInt(e.target.value) || 0))
                              }
                            />
                          </td>
                          <td className="py-3 px-3">
                            <input
                              type="text"
                              placeholder="VD: Hộp rách, móp góc…"
                              disabled={isFullyDone || line.rejectedQty === 0 || submittingReceive}
                              className="min-h-10 w-full rounded-control border border-outline-variant bg-pure-white px-2 text-sm text-on-surface disabled:bg-surface-container-low focus:border-carbon focus:outline-none"
                              value={line.rejectionReason}
                              onChange={(e) => handleReceiveLineChange(item.sku, 'rejectionReason', e.target.value)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid content-start gap-4">
                <Input
                  label="Ghi chú đợt nhận này (Tùy chọn)"
                  placeholder="VD: Đợt giao buổi sáng, biển số xe 29A-12345…"
                  value={batchNote}
                  onChange={(e) => {
                    resetReceiveKey();
                    setBatchNote(e.target.value);
                  }}
                />
                <div className="rounded-control bg-surface-container-low p-3.5 font-body text-body-sm flex flex-col justify-center">
                  <span className="font-semibold text-on-surface">Tóm tắt đợt này:</span>
                  <span className="text-badge-progress-text font-bold">
                    +{totalAcceptedInForm} chiếc chấp nhận (Tăng On-Hand)
                  </span>
                  <span className="text-error font-medium">
                    {totalRejectedInForm} chiếc từ chối (Không tăng tồn)
                  </span>
                </div>
                <Button
                  type="submit"
                  disabled={submittingReceive || totalAcceptedInForm + totalRejectedInForm === 0}
                  className="w-full"
                  leadingIcon={<span className="material-symbols-outlined text-lg" aria-hidden="true">visibility</span>}
                >
                  Xem trước & Xác nhận nhận hàng
                </Button>
              </div>
            </form>
          </Card>
        ) : null}

        {/* Confirmation Preview Modal (Yêu cầu 2) */}
        <Modal
          open={previewModalOpen}
          onClose={() => !submittingReceive && setPreviewModalOpen(false)}
          title="Xác nhận nhận hàng vào kho"
          description={`Kiểm tra dự báo thay đổi tồn kho cho phiếu ${receipt.receipt_number} trước khi ghi nhận chính thức.`}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-3 w-full">
              <div className="flex items-center gap-2">
                {isStaleInventory ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void runPreview()}
                    leadingIcon={<span className="material-symbols-outlined text-base" aria-hidden="true">refresh</span>}
                  >
                    Tải lại xem trước
                  </Button>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setPreviewModalOpen(false)}
                  disabled={submittingReceive}
                >
                  Hủy / Đóng
                </Button>
                <Button
                  onClick={handleCommitReceive}
                  loading={submittingReceive}
                  disabled={submittingReceive || previewLoading || (previewResult ? !previewResult.valid : true)}
                  leadingIcon={<span className="material-symbols-outlined text-base" aria-hidden="true">check_circle</span>}
                >
                  Xác nhận nhập kho
                </Button>
              </div>
            </div>
          }
        >
          {previewLoading ? (
            <div className="py-8 text-center font-body text-body-sm text-graphite">
              Đang xác thực và kiểm tra tồn kho trực tiếp từ máy chủ…
            </div>
          ) : previewResult ? (
            <div className="space-y-4">
              {commitError ? (
                <div className="rounded-control bg-error-container p-3 font-body text-body-sm text-on-error-container">
                  <strong>Lỗi xác nhận:</strong> {commitError}
                </div>
              ) : null}

              {previewError ? (
                <div className="rounded-control bg-error-container p-3 font-body text-body-sm text-on-error-container">
                  <strong>Lỗi kiểm tra dữ liệu:</strong> {previewError}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3 rounded-control bg-surface-container-low p-3 font-body text-caption sm:grid-cols-4">
                <div>
                  <span className="text-graphite">Số phiếu</span>
                  <p className="font-mono font-bold text-on-surface">{previewResult.receipt_number}</p>
                </div>
                <div>
                  <span className="text-graphite">Nhà cung cấp</span>
                  <p className="font-semibold text-on-surface">{previewResult.supplier_name}</p>
                </div>
                <div>
                  <span className="text-graphite">Số lượng SKU</span>
                  <p className="font-mono font-bold text-on-surface">{previewResult.total_skus} SKU</p>
                </div>
                <div>
                  <span className="text-graphite">Tổng chấp nhận</span>
                  <p className="font-mono font-bold text-badge-progress-text">+{previewResult.total_accepted} chiếc</p>
                </div>
              </div>

              <div className="rounded-control border border-carbon/20 bg-surface-container-low p-3 font-body text-caption text-on-surface">
                <div className="flex items-center gap-1.5 font-semibold text-on-surface">
                  <span className="material-symbols-outlined text-base text-channel-accent" aria-hidden="true">
                    sync_alt
                  </span>
                  <span>Phân định cập nhật kho & đồng bộ kênh bán hàng:</span>
                </div>
                <ul className="mt-1 list-inside list-disc text-graphite space-y-0.5">
                  <li>
                    <strong>Tồn kho trung tâm (Core On-Hand):</strong> Tăng ngay lập tức sau khi xác nhận nhận hàng.
                  </li>
                  <li>
                    <strong>Kênh bán hàng:</strong> Được cập nhật tự động bất đồng bộ.
                  </li>
                  <li>
                    <strong>Hàng từ chối ({previewResult.total_rejected} chiếc):</strong> Chỉ lưu vết chứng từ và lý do,{' '}
                    <span className="text-error font-semibold">hoàn toàn KHÔNG cộng vào tồn kho</span> trung tâm hay kênh bán.
                  </li>
                </ul>
              </div>

              <div className="max-h-72 overflow-y-auto rounded-control border border-outline-variant/60">
                <table className="w-full border-collapse text-left font-body text-caption">
                  <thead>
                    <tr className="bg-surface-container-low font-semibold uppercase text-graphite sticky top-0">
                      <th className="py-2 px-3">SKU / Sản phẩm</th>
                      <th className="py-2 px-3 text-right">Chấp nhận</th>
                      <th className="py-2 px-3 text-right">Từ chối</th>
                      <th className="py-2 px-3 text-right">Còn lại sau đợt</th>
                      <th className="py-2 px-3 text-right">Tồn On-Hand (Trước → Sau)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container">
                    {previewResult.items.map((it) => (
                      <tr key={it.sku} className={!it.valid ? 'bg-error-container/30' : undefined}>
                        <td className="py-2 px-3">
                          <span className="font-mono font-bold text-on-surface">{it.sku}</span>
                          <span className="block text-graphite text-[11px]">{it.product_name}</span>
                          {it.errors && it.errors.length > 0 ? (
                            <span className="text-error font-medium text-[11px] block">{it.errors.join('; ')}</span>
                          ) : null}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-badge-progress-text">
                          +{it.accepted_quantity}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          <span className="text-error font-bold">{it.rejected_quantity}</span>
                          {it.rejection_reason ? (
                            <span className="block text-graphite text-[11px]">{it.rejection_reason}</span>
                          ) : null}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-on-surface">
                          {it.remaining_after}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-on-surface font-semibold">
                          {it.current_on_hand} → <span className="text-badge-progress-text font-bold">{it.projected_on_hand}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </Modal>

        {/* Discrepancy & Rejections Management Section (Yêu cầu 6) */}
        <Card className="overflow-hidden p-0">
          <header className="border-b border-outline-variant/50 px-5 py-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-lg text-error" aria-hidden="true">report_problem</span>
                <h2 className="font-display text-lg font-bold text-on-surface">Xử lý hàng lỗi & chênh lệch (Rejections & Replacements)</h2>
              </div>
              <p className="mt-0.5 font-body text-caption text-graphite">
                Theo dõi và xử lý vòng đời hàng lỗi: Yêu cầu giao bù, nhận kiểm đếm bù, trả nhà cung cấp hoặc đóng không bù.
              </p>
            </div>
            <span className="font-mono text-caption text-graphite">{receipt.rejections?.length || 0} mục chênh lệch</span>
          </header>

          {!receipt.rejections || receipt.rejections.length === 0 ? (
            <p className="p-6 text-center font-body text-body-sm text-graphite">
              Không có chênh lệch hàng lỗi nào được ghi nhận cho phiếu này.
            </p>
          ) : (
            <div className="divide-y divide-surface-container">
              {receipt.rejections.map((rj) => {
                const rjStatus = rejectionStatusPresentation[rj.status] ?? { label: rj.status, tone: 'neutral' };
                const canResolve = rj.unresolved_quantity > 0 || rj.status === 'REPLACEMENT_REQUESTED' || rj.status === 'PARTIALLY_REPLACED';

                return (
                  <div key={rj.id} className="p-5 font-body text-body-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <code className="font-mono font-bold text-on-surface text-base">{rj.sku}</code>
                          <span className="text-graphite">· {rj.product_name}</span>
                          <StatusBadge tone={rjStatus.tone}>{rjStatus.label}</StatusBadge>
                        </div>
                        <p className="mt-1 text-caption text-error">
                          <strong>Lý do từ chối:</strong> {rj.rejection_reason}
                        </p>
                      </div>

                      {canResolve ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          leadingIcon={<span className="material-symbols-outlined text-base" aria-hidden="true">build</span>}
                          onClick={() => handleOpenRejectionAction(rj)}
                        >
                          Xử lý chênh lệch
                        </Button>
                      ) : null}
                    </div>

                    {/* Quantities breakdown */}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-6 rounded-control bg-surface-container-low p-3 font-mono text-caption mb-3">
                      <div>
                        <span className="text-[10px] text-graphite uppercase block">Lỗi ban đầu</span>
                        <span className="font-bold text-error">{rj.rejected_quantity}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-graphite uppercase block">Chưa xử lý</span>
                        <span className="font-bold text-warning">{rj.unresolved_quantity}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-graphite uppercase block">Đã yêu cầu bù</span>
                        <span className="font-bold text-on-surface">{rj.replacement_requested_quantity}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-graphite uppercase block">Đã nhận bù (+Tồn)</span>
                        <span className="font-bold text-badge-progress-text">+{rj.replacement_accepted_quantity}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-graphite uppercase block">Đã trả lại NCC</span>
                        <span className="font-bold text-on-surface">{rj.returned_quantity}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-graphite uppercase block">Đóng không bù</span>
                        <span className="font-bold text-graphite">{rj.closed_quantity}</span>
                      </div>
                    </div>

                    {/* Action Timeline */}
                    {rj.actions && rj.actions.length > 0 ? (
                      <div className="mt-3 border-t border-outline-variant/40 pt-3">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-graphite block mb-2">
                          Lịch sử xử lý ({rj.actions.length})
                        </span>
                        <div className="space-y-1.5 text-caption">
                          {rj.actions.map((act) => (
                            <div key={act.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-pure-white p-2 border border-outline-variant/30">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-on-surface">
                                  {act.action_type === 'REQUEST_REPLACEMENT' && 'Yêu cầu giao bù'}
                                  {act.action_type === 'RECEIVE_REPLACEMENT' && 'Nhận hàng giao bù & kiểm đếm'}
                                  {act.action_type === 'RETURN_SUPPLIER' && 'Trả lại nhà cung cấp'}
                                  {act.action_type === 'CLOSE_WITHOUT_REPLACEMENT' && 'Đóng không yêu cầu bù'}
                                </span>
                                <span className="font-mono text-graphite">
                                  (SL: {act.quantity}
                                  {act.action_type === 'RECEIVE_REPLACEMENT' ? ` | Đạt: +${act.accepted_quantity}, Lỗi: ${act.rejected_quantity}` : ''})
                                </span>
                                {act.note ? <span className="text-graphite italic">— {act.note}</span> : null}
                              </div>
                              <div className="text-right text-[11px] text-graphite font-mono">
                                {act.actor_email} · {formatTime(act.created_at)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Document Attachments Management Section (Yêu cầu 8) */}
        <Card className="overflow-hidden p-0">
          <header className="border-b border-outline-variant/50 px-5 py-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-lg text-primary" aria-hidden="true">attach_file</span>
                <h2 className="font-display text-lg font-bold text-on-surface">Tài liệu & Chứng từ đính kèm (Document Attachments)</h2>
              </div>
              <p className="mt-0.5 font-body text-caption text-graphite">
                Đính kèm biên bản giao nhận, hóa đơn VAT hoặc ảnh chụp hàng hỏng (PDF, PNG, JPEG tối đa 10MB/tệp, tối đa 20 tệp).
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={(receipt.attachments?.length || 0) >= 20}
              leadingIcon={<span className="material-symbols-outlined text-base" aria-hidden="true">upload_file</span>}
              onClick={() => {
                setAttachmentFile(null);
                setAttachmentDesc('');
                setAttachmentError(null);
                setAttachmentModalOpen(true);
              }}
            >
              Tải lên tài liệu ({(receipt.attachments?.length || 0)}/20)
            </Button>
          </header>

          {!receipt.attachments || receipt.attachments.length === 0 ? (
            <p className="p-6 text-center font-body text-body-sm text-graphite">
              Chưa có tài liệu hay chứng từ nào được đính kèm cho phiếu nhập này.
            </p>
          ) : (
            <div className="divide-y divide-surface-container">
              {receipt.attachments.map((att) => (
                <div key={att.id} className="p-4 flex flex-wrap items-center justify-between gap-3 font-body text-body-sm hover:bg-surface-container-low/40">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-2xl text-graphite" aria-hidden="true">
                      {att.mime_type === 'application/pdf' ? 'picture_as_pdf' : 'image'}
                    </span>
                    <div>
                      <p className="font-semibold text-on-surface">{att.file_name}</p>
                      <p className="text-caption text-graphite">
                        {formatBytes(att.byte_size)} · {att.uploaded_by_email} · {formatTime(att.created_at)}
                      </p>
                      {att.description ? <p className="text-caption text-on-surface mt-0.5">{att.description}</p> : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPreviewAttachment(att)}
                      leadingIcon={<span className="material-symbols-outlined text-base" aria-hidden="true">visibility</span>}
                    >
                      Xem
                    </Button>

                    <a
                      href={getAttachmentDownloadUrl(receipt.id, att.id)}
                      download={att.file_name}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-caption font-semibold text-channel-accent hover:underline px-2 py-1"
                    >
                      <span className="material-symbols-outlined text-base" aria-hidden="true">download</span>
                      Tải về
                    </a>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-error hover:bg-error-container/40"
                      onClick={() => void handleDeleteAttachment(att.id)}
                      leadingIcon={<span className="material-symbols-outlined text-base" aria-hidden="true">delete</span>}
                    >
                      Xóa
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Audit Trail & History */}
        <div className="grid gap-6">
          {/* Receiving Events History */}
          <Card className="overflow-hidden p-0">
            <header className="border-b border-outline-variant/50 px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-bold text-on-surface">Lịch sử các đợt nhận hàng</h2>
                <p className="mt-0.5 font-body text-caption text-graphite">Lịch sử nhận hàng thực tế và biến động tồn kho</p>
              </div>
              <span className="font-mono text-caption text-graphite">{receipt.events?.length || 0} đợt đã ghi</span>
            </header>

            {!receipt.events || receipt.events.length === 0 ? (
              <p className="p-6 text-center font-body text-body-sm text-graphite">
                Chưa có đợt nhận hàng nào được ghi nhận cho phiếu này.
              </p>
            ) : (
              <div className="divide-y divide-surface-container">
                {receipt.events.map((ev) => (
                  <div key={ev.id} className="p-5 font-body text-body-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-carbon px-2 py-0.5 font-mono text-caption font-bold text-pure-white">
                          Đợt #{ev.batch_number}
                        </span>
                        <span className="font-semibold text-on-surface">{ev.actor_email}</span>
                      </div>
                      <span className="font-mono text-caption text-graphite">{formatTime(ev.created_at)}</span>
                    </div>
                    {ev.note ? <p className="mb-3 text-caption text-graphite italic">Ghi chú: {ev.note}</p> : null}
                    <div className="overflow-x-auto rounded-control border border-outline-variant/50">
                      <table className="w-full border-collapse text-left text-caption">
                        <thead>
                          <tr className="bg-surface-container-low text-graphite uppercase font-semibold">
                            <th className="py-2 px-3">SKU</th>
                            <th className="py-2 px-3 text-right">Chấp nhận</th>
                            <th className="py-2 px-3 text-right">Từ chối</th>
                            <th className="py-2 px-3 text-right">Tồn kho biến động</th>
                            <th className="py-2 px-3">Lý do từ chối</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-container">
                          {ev.items.map((it) => (
                            <tr key={it.id}>
                              <td className="py-2 px-3 font-mono font-bold text-on-surface">{it.sku}</td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-badge-progress-text">
                                +{it.accepted_quantity}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-error">
                                {it.rejected_quantity}
                              </td>
                              <td className="py-2 px-3 text-right font-mono text-on-surface">
                                {it.on_hand_before} → {it.on_hand_after}
                              </td>
                              <td className="py-2 px-3 text-graphite">{it.rejection_reason || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Draft Edit Audit Trail (Yêu cầu 3) */}
          {auditEntries && auditEntries.length > 0 ? (
            <Card className="overflow-hidden p-0">
              <header className="border-b border-outline-variant/50 px-5 py-4 flex items-center justify-between">
                <div>
                  <h2 className="font-display text-lg font-bold text-on-surface">Nhật ký chỉnh sửa bản nháp</h2>
                  <p className="mt-0.5 font-body text-caption text-graphite">Lịch sử thay đổi thông tin phiếu ở trạng thái nháp</p>
                </div>
                <span className="font-mono text-caption text-graphite">{auditEntries.length} lần chỉnh sửa</span>
              </header>
              <div className="divide-y divide-surface-container">
                {auditEntries.map((audit) => {
                  const changes = audit.changes || {};
                  const before = changes.before;
                  const after = changes.after;

                  return (
                    <div key={audit.id} className="p-4 font-body text-body-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-channel-accent/10 px-2 py-0.5 font-body text-caption font-bold text-channel-accent">
                            {audit.action}
                          </span>
                          <span className="font-semibold text-on-surface">{audit.actor_email}</span>
                        </div>
                        <span className="font-mono text-caption text-graphite">{formatTime(audit.created_at)}</span>
                      </div>

                      {before && after ? (
                        <div className="mt-2 text-caption text-graphite space-y-1">
                          {before.supplier_name !== after.supplier_name ? (
                            <p>
                              Nhà cung cấp:{' '}
                              <span className="line-through text-error">{before.supplier_name}</span> →{' '}
                              <span className="text-badge-progress-text font-semibold">{after.supplier_name}</span>
                            </p>
                          ) : null}
                          {before.reference_number !== after.reference_number ? (
                            <p>
                              Số tham chiếu:{' '}
                              <span className="line-through text-error">{before.reference_number || '(trống)'}</span> →{' '}
                              <span className="text-badge-progress-text font-semibold">{after.reference_number || '(trống)'}</span>
                            </p>
                          ) : null}
                          {before.items?.length !== after.items?.length ? (
                            <p>
                              Số dòng SKU:{' '}
                              <span className="line-through text-error">{before.items?.length || 0}</span> →{' '}
                              <span className="text-badge-progress-text font-semibold">{after.items?.length || 0} SKU</span>
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : null}
        </div>

        {/* Modal Kết thúc sớm (Yêu cầu 4) */}
        <Modal
          open={closeShortModalOpen}
          onClose={() => setCloseShortModalOpen(false)}
          title="Kết thúc sớm phiếu nhập hàng (Close Short)"
          description={`Bạn có chắc chắn muốn kết thúc sớm phiếu ${receipt.receipt_number}? Sau khi kết thúc sớm, số lượng còn lại sẽ trở thành số lượng thiếu (Short Quantity), phiếu chuyển sang trạng thái KẾT THÚC SỚM và không thể nhận thêm hàng.`}
          footer={
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setCloseShortModalOpen(false)} disabled={submittingCloseShort}>
                Đóng
              </Button>
              <Button
                className="bg-warning hover:bg-warning/90 text-on-surface font-semibold"
                onClick={() => void handleConfirmCloseShort()}
                loading={submittingCloseShort}
                disabled={submittingCloseShort || !closeShortReason.trim()}
              >
                Xác nhận kết thúc sớm
              </Button>
            </div>
          }
        >
          {closeShortError ? (
            <div className="mb-4 rounded-control bg-error-container p-3 font-body text-body-sm text-on-error-container">
              {closeShortError}
            </div>
          ) : null}
          <div className="space-y-4">
            <div className="rounded-control bg-surface-container-low p-3 text-caption text-graphite">
              Lưu ý an toàn tồn kho: Các đợt nhận hàng trước đó và biến động tồn kho đã cộng On-Hand được{' '}
              <strong>bảo toàn 100%</strong>. Thao tác kết thúc sớm không làm thay đổi tồn kho hiện tại.
            </div>
            <Input
              label="Lý do kết thúc sớm *"
              required
              placeholder="VD: Nhà cung cấp hết hàng đợt 2, hai bên thống nhất không giao tiếp…"
              value={closeShortReason}
              onChange={(e) => {
                resetCloseShortKey();
                setCloseShortReason(e.target.value);
              }}
            />
          </div>
        </Modal>

        {/* Modal Hủy Phiếu */}
        <Modal
          open={cancelModalOpen}
          onClose={() => setCancelModalOpen(false)}
          title="Hủy phiếu nhập hàng"
          description={`Bạn có chắc chắn muốn hủy phiếu ${receipt.receipt_number}? Thao tác này chỉ áp dụng cho phiếu chưa phát sinh nhận hàng.`}
          footer={
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setCancelModalOpen(false)} disabled={submittingCancel}>
                Đóng
              </Button>
              <Button
                className="bg-error hover:bg-error/90 text-pure-white"
                onClick={() => void handleCancelReceipt()}
                loading={submittingCancel}
                disabled={submittingCancel || !cancelReason.trim()}
              >
                Xác nhận hủy
              </Button>
            </div>
          }
        >
          {cancelError ? (
            <div className="mb-4 rounded-control bg-error-container p-3 font-body text-body-sm text-on-error-container">
              {cancelError}
            </div>
          ) : null}
          <Input
            label="Lý do hủy *"
            required
            placeholder="VD: Nhà cung cấp hết hàng, hủy kế hoạch nhập…"
            value={cancelReason}
            onChange={(e) => {
              resetCancelKey();
              setCancelReason(e.target.value);
            }}
          />
        </Modal>

        {/* Modal Xử lý hàng lỗi (Yêu cầu 6) */}
        <Modal
          open={rejectionActionModalOpen}
          onClose={() => setRejectionActionModalOpen(false)}
          title="Xử lý chênh lệch hàng lỗi"
          description={`Xử lý cho SKU ${selectedRejection?.sku} (${selectedRejection?.product_name}). Chưa giải quyết: ${selectedRejection?.unresolved_quantity} chiếc.`}
          footer={
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setRejectionActionModalOpen(false)} disabled={submittingRejectionAction}>
                Đóng
              </Button>
              <Button
                onClick={() => void handleConfirmRejectionAction()}
                loading={submittingRejectionAction}
                disabled={submittingRejectionAction}
              >
                Xác nhận xử lý
              </Button>
            </div>
          }
        >
          {rejectionActionError ? (
            <div className="mb-4 rounded-control bg-error-container p-3 font-body text-body-sm text-on-error-container">
              {rejectionActionError}
            </div>
          ) : null}

          <div className="space-y-4">
            <div>
              <label className="font-body text-caption font-semibold text-graphite block mb-1">
                Phương thức xử lý *
              </label>
              <select
                value={rejectionActionType}
                onChange={(e) => setRejectionActionType(e.target.value as any)}
                className="w-full min-h-10 rounded-control border border-outline-variant bg-pure-white px-3 font-body text-sm text-on-surface focus:border-carbon focus:outline-none"
              >
                <option value="REQUEST_REPLACEMENT">1. Yêu cầu nhà cung cấp giao bù (REQUEST_REPLACEMENT)</option>
                <option value="RECEIVE_REPLACEMENT">2. Nhận hàng giao bù & kiểm đếm (RECEIVE_REPLACEMENT)</option>
                <option value="RETURN_SUPPLIER">3. Trả lại nhà cung cấp (RETURN_SUPPLIER)</option>
                <option value="CLOSE_WITHOUT_REPLACEMENT">4. Đóng không yêu cầu bù (CLOSE_WITHOUT_REPLACEMENT)</option>
              </select>
            </div>

            {rejectionActionType === 'RECEIVE_REPLACEMENT' ? (
              <div className="rounded-control bg-surface-container-low p-3 space-y-3">
                <p className="text-caption text-graphite">
                  Kiểm đếm đợt hàng bù từ nhà cung cấp.{' '}
                  <strong>Chỉ số lượng đạt chuẩn (Accepted) mới được cộng vào tồn kho On-Hand trung tâm</strong>.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Đạt chuẩn (+Tồn On-Hand) *"
                    type="number"
                    min="0"
                    value={rejectionAcceptedQty}
                    onChange={(e) => setRejectionAcceptedQty(Math.max(0, parseInt(e.target.value) || 0))}
                  />
                  <Input
                    label="Vẫn bị lỗi/từ chối"
                    type="number"
                    min="0"
                    value={rejectionRejectedQty}
                    onChange={(e) => setRejectionRejectedQty(Math.max(0, parseInt(e.target.value) || 0))}
                  />
                </div>
                {rejectionRejectedQty > 0 ? (
                  <Input
                    label="Lý do từ chối hàng bù *"
                    placeholder="VD: Hàng bù vẫn bị vỡ…"
                    value={rejectionActionReason}
                    onChange={(e) => setRejectionActionReason(e.target.value)}
                  />
                ) : null}
              </div>
            ) : (
              <div>
                <Input
                  label="Số lượng *"
                  type="number"
                  min="1"
                  max={selectedRejection?.unresolved_quantity || 1}
                  value={rejectionActionQty}
                  onChange={(e) => setRejectionActionQty(Math.max(1, parseInt(e.target.value) || 1))}
                />
                {rejectionActionType === 'RETURN_SUPPLIER' ? (
                  <p className="mt-1 text-[11px] text-graphite">
                    Lưu ý: Hàng từ chối chưa từng được cộng vào tồn kho On-Hand, do đó thao tác hoàn trả nhà cung cấp này
                    ghi nhận chứng từ trả mà <strong>không trừ lặp lại tồn kho</strong>.
                  </p>
                ) : null}
              </div>
            )}

            <Input
              label="Ghi chú xử lý"
              placeholder="VD: Thỏa thuận bù đợt PO tiếp theo, biên bản kiểm tra số..."
              value={rejectionActionNote}
              onChange={(e) => setRejectionActionNote(e.target.value)}
            />
          </div>
        </Modal>

        {/* Modal Tải lên tài liệu đính kèm (Yêu cầu 8) */}
        <Modal
          open={attachmentModalOpen}
          onClose={() => setAttachmentModalOpen(false)}
          title="Tải lên tài liệu chứng từ"
          description="Đính kèm tài liệu chứng từ cho phiếu nhập kho (Biên bản giao nhận, hóa đơn, ảnh kiểm đếm). Định dạng hỗ trợ: PDF, JPEG, PNG. Dung lượng tối đa: 10MB."
          footer={
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setAttachmentModalOpen(false)} disabled={submittingAttachment}>
                Đóng
              </Button>
              <Button
                onClick={(e) => void handleUploadAttachment(e)}
                loading={submittingAttachment}
                disabled={submittingAttachment || !attachmentFile}
              >
                Tải lên
              </Button>
            </div>
          }
        >
          {attachmentError ? (
            <div className="mb-4 rounded-control bg-error-container p-3 font-body text-body-sm text-on-error-container">
              {attachmentError}
            </div>
          ) : null}

          <div className="space-y-4">
            <div>
              <label className="font-body text-caption font-semibold text-graphite block mb-1">
                Chọn tệp (PDF, JPEG, PNG tối đa 10MB) *
              </label>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setAttachmentFile(file);
                }}
                className="w-full text-sm text-graphite file:mr-3 file:py-2 file:px-4 file:rounded-control file:border-0 file:text-sm file:font-semibold file:bg-surface-container-low file:text-on-surface hover:file:bg-surface-container cursor-pointer"
              />
            </div>

            <Input
              label="Mô tả tệp (Tùy chọn)"
              placeholder="VD: Biên bản bàn giao có chữ ký hai bên…"
              value={attachmentDesc}
              onChange={(e) => setAttachmentDesc(e.target.value)}
            />
          </div>
        </Modal>

        {/* Modal Xem trước tài liệu đính kèm (Yêu cầu 8) */}
        <Modal
          open={!!previewAttachment}
          onClose={() => setPreviewAttachment(null)}
          title={previewAttachment?.file_name || 'Xem trước tài liệu'}
          description={`${previewAttachment ? formatBytes(previewAttachment.byte_size) : ''} · Tải lên bởi ${previewAttachment?.uploaded_by_email || ''}`}
          footer={
            <div className="flex justify-between w-full">
              {previewAttachment ? (
                <a
                  href={getAttachmentDownloadUrl(receipt.id, previewAttachment.id)}
                  download={previewAttachment.file_name}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-channel-accent hover:underline"
                >
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">download</span>
                  Tải về máy
                </a>
              ) : <div />}
              <Button variant="ghost" onClick={() => setPreviewAttachment(null)}>
                Đóng
              </Button>
            </div>
          }
        >
          {previewAttachment ? (
            <div className="flex justify-center items-center p-2 max-h-[70vh] overflow-auto">
              {previewAttachment.mime_type.startsWith('image/') ? (
                <img
                  src={getAttachmentDownloadUrl(receipt.id, previewAttachment.id)}
                  alt={previewAttachment.file_name}
                  className="max-w-full max-h-[60vh] object-contain rounded"
                />
              ) : (
                <iframe
                  src={getAttachmentDownloadUrl(receipt.id, previewAttachment.id)}
                  title={previewAttachment.file_name}
                  className="w-full h-[60vh] border rounded"
                />
              )}
            </div>
          ) : null}
        </Modal>
      </section>
    </>
  );
}
