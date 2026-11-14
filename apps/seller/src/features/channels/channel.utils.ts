import type { ChannelFilters, ChannelMappingStatus, SalesChannel } from './channel.types';

export const initialChannelFilters: ChannelFilters = { query: '', kind: 'all', environment: 'all', connection: 'all' };

export const connectionPresentation = {
  connected: { label: 'Đang kết nối', tone: 'success' },
  disconnected: { label: 'Chưa kết nối', tone: 'neutral' },
  pending_authorization: { label: 'Dự kiến', tone: 'warning' },
  error: { label: 'Chưa hỗ trợ', tone: 'danger' },
} as const;

export const mappingPresentation: Record<ChannelMappingStatus, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  mapped: { label: 'Đã liên kết', tone: 'success' },
  unmapped: { label: 'Chưa liên kết', tone: 'warning' },
  conflict: { label: 'Xung đột', tone: 'danger' },
};

export function filterChannels(channels: SalesChannel[], filters: ChannelFilters): SalesChannel[] {
  const query = filters.query.trim().toLocaleLowerCase('vi');
  return channels.filter((channel) => (!query || [channel.name, channel.subtitle, channel.summary].some((value) => value.toLocaleLowerCase('vi').includes(query)))
    && (filters.kind === 'all' || channel.kind === filters.kind)
    && (filters.environment === 'all' || channel.environment === filters.environment)
    && (filters.connection === 'all' || channel.connectionStatus === filters.connection));
}

export function formatChannelTime(value: string | null): string {
  if (!value) return 'Chưa đồng bộ lần nào';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));
}
