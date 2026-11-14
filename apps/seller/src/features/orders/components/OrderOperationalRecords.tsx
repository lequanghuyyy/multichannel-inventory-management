import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { useAuth } from '../../auth/AuthProvider';
import {
  createOrderInternalNote,
  deleteOrderAttachment,
  getOrderAttachmentBlob,
  listOrderAttachments,
  listOrderInternalNotes,
  uploadOrderAttachment,
  type OrderAttachment,
  type OrderAttachmentEvent,
  type OrderInternalNote,
} from '../../../api/orders';

const formatTime = (value: string) => new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value));

function actorLabel(email?: string | null): string {
  return email?.trim() || 'Không có thông tin';
}

function formatSize(size: number): string {
  return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function OrderOperationalRecords({ orderId }: { orderId: string }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [notes, setNotes] = useState<OrderInternalNote[]>([]);
  const [attachments, setAttachments] = useState<OrderAttachment[]>([]);
  const [events, setEvents] = useState<OrderAttachmentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [body, setBody] = useState('');
  const [attention, setAttention] = useState(false);
  const [noteBusy, setNoteBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<{ name: string; mime: string; url: string } | null>(null);
  const [activeFile, setActiveFile] = useState('');

  const refresh = async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError('');
    try {
      const [nextNotes, nextAttachments] = await Promise.all([
        listOrderInternalNotes(orderId, signal),
        listOrderAttachments(orderId, signal),
      ]);
      if (!signal?.aborted) {
        setNotes(nextNotes);
        setAttachments(nextAttachments.attachments);
        setEvents(nextAttachments.events);
      }
    } catch (error) {
      if (!signal?.aborted) setLoadError(error instanceof Error ? error.message : 'Không tải được ghi chú và chứng từ.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  const refreshAttachments = async () => {
    const next = await listOrderAttachments(orderId);
    setAttachments(next.attachments);
    setEvents(next.events);
  };

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [orderId]);

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
  }, [preview?.url]);

  const addNote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!body.trim()) return;
    setNoteBusy(true);
    setActionError('');
    setMessage('');
    try {
      const note = await createOrderInternalNote(orderId, { body: body.trim(), is_attention: attention });
      setNotes((current) => [note, ...current]);
      setBody('');
      setAttention(false);
      setMessage('Đã thêm ghi chú nội bộ.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Không thể lưu ghi chú.');
    } finally {
      setNoteBusy(false);
    }
  };

  const upload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) return;
    setAttachmentBusy(true);
    setActionError('');
    setMessage('');
    try {
      await uploadOrderAttachment(orderId, file, description);
      await refreshAttachments();
      setFile(null);
      setDescription('');
      const picker = document.getElementById(`order-file-${orderId}`) as HTMLInputElement | null;
      if (picker) picker.value = '';
      setMessage('Đã lưu chứng từ riêng tư cho đơn hàng.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Không thể tải chứng từ lên.');
    } finally {
      setAttachmentBusy(false);
    }
  };

  const openPreview = async (item: OrderAttachment) => {
    setActiveFile(item.id);
    setActionError('');
    try {
      const blob = await getOrderAttachmentBlob(orderId, item.id);
      const url = URL.createObjectURL(blob);
      setPreview({ name: item.file_name, mime: item.mime_type, url });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Không thể mở chứng từ.');
    } finally {
      setActiveFile('');
    }
  };

  const download = async (item: OrderAttachment) => {
    setActiveFile(item.id);
    setActionError('');
    try {
      const blob = await getOrderAttachmentBlob(orderId, item.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = item.file_name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Không thể tải chứng từ xuống.');
    } finally {
      setActiveFile('');
    }
  };

  const removeAttachment = async (item: OrderAttachment) => {
    if (!isAdmin || !window.confirm(`Ẩn chứng từ “${item.file_name}” khỏi danh sách đơn hàng? Lịch sử lưu trữ vẫn được giữ.`)) return;
    setActiveFile(item.id);
    setActionError('');
    try {
      await deleteOrderAttachment(orderId, item.id);
      await refreshAttachments();
      setMessage('Đã ẩn chứng từ. Tệp được giữ theo lịch sử lưu trữ.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Không thể ẩn chứng từ.');
    } finally {
      setActiveFile('');
    }
  };

  return (
    <div className="grid gap-5">
      <Card className="grid gap-4 border border-outline-variant/60 p-5 shadow-none sm:p-6" aria-labelledby="internal-notes-heading">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant/50 pb-3">
          <div>
            <span className="font-body text-caption font-bold uppercase tracking-wider text-channel-accent">Trao đổi trong cửa hàng</span>
            <h2 id="internal-notes-heading" className="mt-0.5 font-display text-lg font-bold text-on-surface">Ghi chú nội bộ</h2>
            <p className="mt-1 font-body text-caption text-graphite">Chỉ nhân viên được cấp quyền xem. Ghi chú không gửi đến khách hoặc marketplace.</p>
          </div>
          <span className="rounded-full bg-surface-container-low px-3 py-1 font-body text-caption font-semibold text-on-surface-variant">{notes.length} ghi chú</span>
        </header>

        <form className="grid gap-3" onSubmit={addNote}>
          <label className="grid gap-1.5 font-body text-caption font-semibold text-on-surface" htmlFor={`order-note-${orderId}`}>
            Thêm nội dung cần theo dõi
            <textarea id={`order-note-${orderId}`} value={body} onChange={(event) => setBody(event.target.value)}
              maxLength={2000} rows={3} required placeholder="Ví dụ: Khách yêu cầu giao sau 17 giờ."
              className="min-h-24 w-full rounded-control border border-outline-variant bg-surface px-3 py-2 font-normal text-on-surface placeholder:text-graphite/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 font-body text-caption text-on-surface">
              <input type="checkbox" checked={attention} onChange={(event) => setAttention(event.target.checked)} className="size-4 accent-primary" />
              Đánh dấu cần chú ý
            </label>
            <Button type="submit" size="sm" disabled={!body.trim()} loading={noteBusy}>Thêm ghi chú</Button>
          </div>
        </form>

        {loading ? <p className="font-body text-body-sm text-graphite" role="status">Đang tải ghi chú…</p> : null}
        {loadError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-danger/40 bg-danger/10 p-3 font-body text-caption text-on-surface"><span>{loadError}</span><Button size="sm" variant="secondary" onClick={() => void refresh()}>Thử lại</Button></div> : null}
        {!loading && !loadError && notes.length === 0 ? <p className="rounded-control bg-surface-container-low p-4 font-body text-body-sm text-graphite">Chưa có ghi chú nội bộ.</p> : null}
        {notes.length > 0 ? <ol className="grid gap-2">
          {notes.map((note) => <li key={note.id} className={`rounded-control border p-3.5 ${note.is_attention ? 'border-channel-accent/50 bg-channel-paper' : 'border-outline-variant/50 bg-surface-container-low'}`}>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 font-body text-[11px] text-graphite">
              <span className="font-semibold text-on-surface">{actorLabel(note.created_by_email)}</span>
              <time dateTime={note.created_at}>{formatTime(note.created_at)}</time>
            </div>
            {note.is_attention ? <span className="mt-2 inline-flex rounded-full bg-channel-accent/10 px-2 py-0.5 font-body text-[11px] font-bold text-channel-accent">Cần chú ý</span> : null}
            <p className="mt-2 whitespace-pre-wrap break-words font-body text-body-sm text-on-surface">{note.body}</p>
          </li>)}
        </ol> : null}
      </Card>

      <Card className="grid gap-4 border border-outline-variant/60 p-5 shadow-none sm:p-6" aria-labelledby="order-attachments-heading">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant/50 pb-3">
          <div>
            <span className="font-body text-caption font-bold uppercase tracking-wider text-channel-accent">Tệp riêng tư của đơn</span>
            <h2 id="order-attachments-heading" className="mt-0.5 font-display text-lg font-bold text-on-surface">Chứng từ</h2>
            <p className="mt-1 font-body text-caption text-graphite">PDF, JPEG hoặc PNG · tối đa 10 MB mỗi tệp. Tải xuống cần đăng nhập.</p>
          </div>
          <span className="rounded-full bg-surface-container-low px-3 py-1 font-body text-caption font-semibold text-on-surface-variant">{attachments.length}/20 tệp</span>
        </header>

        <form className="grid gap-3 rounded-control bg-surface-container-low p-4" onSubmit={upload}>
          <label className="grid gap-1.5 font-body text-caption font-semibold text-on-surface" htmlFor={`order-file-${orderId}`}>
            Chọn chứng từ
            <input id={`order-file-${orderId}`} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="block w-full rounded-control border border-outline-variant bg-surface p-2 font-normal file:mr-3 file:rounded-control file:border-0 file:bg-carbon file:px-3 file:py-1.5 file:font-semibold file:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" />
          </label>
          <label className="grid gap-1.5 font-body text-caption font-semibold text-on-surface" htmlFor={`order-file-description-${orderId}`}>
            Mô tả (không bắt buộc)
            <input id={`order-file-description-${orderId}`} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500}
              placeholder="Ví dụ: Ảnh kiện hàng trước khi bàn giao" className="min-h-10 rounded-control border border-outline-variant bg-surface px-3 py-2 font-normal text-on-surface placeholder:text-graphite/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-body text-[11px] text-graphite">Tệp lưu trong vùng riêng tư, không dùng làm bằng chứng thanh toán hoặc giao thành công.</span>
            <Button type="submit" size="sm" disabled={!file || attachments.length >= 20} loading={attachmentBusy}>Tải chứng từ lên</Button>
          </div>
        </form>

        {actionError ? <p role="alert" className="rounded-control border border-danger/40 bg-danger/10 p-3 font-body text-caption text-on-surface">{actionError}</p> : null}
        {message ? <p role="status" className="rounded-control border border-outline-variant/50 bg-surface-container-low p-3 font-body text-caption text-on-surface">{message}</p> : null}
        {!loading && !loadError && attachments.length === 0 ? <p className="rounded-control bg-surface-container-low p-4 font-body text-body-sm text-graphite">Chưa có chứng từ đính kèm.</p> : null}
        {attachments.length > 0 ? <ul className="grid gap-2">
          {attachments.map((item) => <li key={item.id} className="grid gap-3 rounded-control border border-outline-variant/50 p-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <p className="break-all font-body text-body-sm font-semibold text-on-surface">{item.file_name}</p>
              <p className="mt-1 font-body text-caption text-graphite">{item.description || 'Không có mô tả'} · {formatSize(item.byte_size)} · {actorLabel(item.uploaded_by_email)} · {formatTime(item.created_at)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={activeFile === item.id} onClick={() => void openPreview(item)}>Xem trước</Button>
              <Button size="sm" variant="secondary" disabled={activeFile === item.id} onClick={() => void download(item)}>Tải xuống</Button>
              {isAdmin ? <Button size="sm" variant="ghost" disabled={activeFile === item.id} onClick={() => void removeAttachment(item)}>Ẩn tệp</Button> : null}
            </div>
          </li>)}
        </ul> : null}

        {events.length > 0 ? <details className="rounded-control border border-outline-variant/50 px-4 py-3">
          <summary className="cursor-pointer font-body text-caption font-semibold text-on-surface">Lịch sử chứng từ ({events.length})</summary>
          <ol className="mt-3 grid gap-2 border-l border-outline-variant pl-4">
            {events.map((event) => <li key={event.id} className="font-body text-caption text-on-surface-variant">
              <strong className="text-on-surface">{event.action === 'uploaded' ? 'Tải lên' : 'Ẩn khỏi danh sách'}</strong> · {event.file_name}
              <span className="block text-[11px] text-graphite">{actorLabel(event.actor_email)} · {formatTime(event.created_at)}</span>
            </li>)}
          </ol>
        </details> : null}
      </Card>

      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title={preview?.name ?? 'Xem chứng từ'} description="Nội dung lấy từ kho riêng tư sau khi xác thực quyền truy cập." className="max-w-4xl">
        {preview?.mime.startsWith('image/') ? <img src={preview.url} alt={preview.name} className="mx-auto max-h-[70dvh] max-w-full object-contain" /> : preview ? <iframe src={preview.url} title={preview.name} sandbox="" referrerPolicy="no-referrer" className="h-[70dvh] w-full rounded-control border border-outline-variant" /> : null}
      </Modal>
    </div>
  );
}
