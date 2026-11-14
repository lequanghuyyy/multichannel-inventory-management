import { Tabs, type TabItem } from '../../../components/ui/Tabs';

export type AISectionTab = 'recommendations' | 'models' | 'sync-health' | 'failures';

const tabs: TabItem<AISectionTab>[] = [
  { value: 'recommendations', label: 'Đề xuất (4)' },
  { value: 'models', label: 'Mô hình (4)' },
  { value: 'sync-health', label: 'Giám sát đồng bộ' },
  { value: 'failures', label: 'Dự phòng & giới hạn' },
];

export function AISectionTabs({ value, onChange }: { value: AISectionTab; onChange: (value: AISectionTab) => void }) {
  return <Tabs items={tabs} value={value} onValueChange={onChange} ariaLabel="Các phần của Trợ lý AI" className="w-fit max-w-full" />;
}
