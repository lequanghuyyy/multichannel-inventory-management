// Every list endpoint is keyset-paginated and its `next_cursor` is OMITTED on the last
// page, not sent as null or an empty string. A client that treats a missing cursor as
// "keep going" would loop forever on the final page, so `null` is the only honest value
// here and callers must compare against null, never against a falsy value.
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  totalCount?: number;
  statusCounts?: Record<string, number>;
}

export function pageOf<T>(body: unknown, key: string): Page<T> {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Dữ liệu nhận về không hợp lệ.');
  }
  const record = body as Record<string, unknown>;
  const rows = record[key];
  if (!Array.isArray(rows)) {
    throw new Error('Dữ liệu nhận về không hợp lệ.');
  }
  const statusCounts = typeof record.status_counts === 'object' && record.status_counts !== null
    ? Object.fromEntries(Object.entries(record.status_counts).filter(([, count]) => typeof count === 'number')) as Record<string, number>
    : undefined;
  return {
    items: rows as T[],
    nextCursor: typeof record.next_cursor === 'string' ? record.next_cursor : null,
    totalCount: typeof record.total_count === 'number' ? record.total_count : undefined,
    statusCounts,
  };
}
