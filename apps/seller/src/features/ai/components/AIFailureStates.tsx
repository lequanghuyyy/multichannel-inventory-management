import { Card } from '../../../components/ui/Card';

const states = [
  { title: 'Mô hình không khả dụng', detail: 'Giữ nguyên chính sách hiện tại; không thay đổi tồn kho.', result: 'Chỉ dùng quy tắc cố định' },
  { title: 'Mô hình phản hồi quá lâu', detail: 'Ngưỡng 200 ms chỉ là ví dụ minh hoạ, chưa phải số liệu đo thực tế.', result: 'Dùng phương án dự phòng' },
  { title: 'Hết hạn mức dịch vụ ngoài', detail: 'Chưa cấu hình tài khoản dịch vụ AI bên ngoài.', result: 'Chưa gửi yêu cầu nào' },
  { title: 'Dự báo đã cũ', detail: 'Đề xuất quá thời hạn hiệu lực sẽ được đánh dấu là đã cũ.', result: 'Cần đọc lại dữ liệu mới' },
  { title: 'Kết quả không hợp lệ', detail: 'Nếu kết quả sai định dạng, mức tồn đệm đang áp dụng được giữ nguyên.', result: 'Không thay đổi gì' },
] as const;

export function AIFailureStates() {
  return <section className="grid gap-5"><Card className="bg-secondary-fixed"><span className="font-body text-caption font-semibold uppercase tracking-wider text-graphite">Phương án dự phòng (minh hoạ)</span><h2 className="mt-2 font-display text-xl font-bold text-on-surface">Mô hình LSTM-small-v1 → Trung bình trượt 7 ngày</h2><p className="mt-2 font-body text-body-sm text-on-surface-variant">Ví dụ minh hoạ khi mô hình phản hồi quá lâu. Chưa có mô hình nào chạy và chưa có chính sách tồn kho nào bị thay đổi.</p></Card><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{states.map((state) => <Card key={state.title} variant="muted" className="grid content-start gap-3"><span className="material-symbols-outlined text-xl text-graphite" aria-hidden="true">warning</span><h3 className="font-display text-base font-bold text-on-surface">{state.title}</h3><p className="font-body text-caption leading-5 text-graphite">{state.detail}</p><strong className="mt-auto border-t border-outline-variant/50 pt-3 font-body text-caption text-on-surface">{state.result}</strong></Card>)}</div><Card className="flex flex-col justify-between gap-4 bg-carbon text-pure-white md:flex-row md:items-center"><div><h2 className="font-display text-lg font-bold">AI không tự thay đổi tồn kho</h2><p className="mt-1 font-body text-body-sm text-pure-white/65">Khi mô hình lỗi, quá hạn hoặc trả kết quả không hợp lệ, số lượng tồn kho vẫn giữ nguyên.</p></div><span className="shrink-0 rounded-full bg-pure-white/10 px-3 py-1 font-body text-caption text-pure-white/70">Cần chính sách do hệ thống kiểm soát</span></Card></section>;
}
