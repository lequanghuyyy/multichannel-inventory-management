import { describe, expect, it } from 'vitest';
import { ApiRequestError, parseApiError, presentApiError } from './api-error';

function requestError(code: string) {
  return new ApiRequestError(parseApiError({ error: { code, message: 'server supplied text must not control UI', details: { field: 'sku' }, request_id: 'req-001' } }));
}

describe('API error contract', () => {
  it('parses the shared API error envelope with safe optional details', () => {
    const error = parseApiError({ error: { code: 'SKU_NOT_FOUND', message: 'SKU not found', details: { sku: 'SKU-001' }, request_id: 'req-001' } });
    expect(error.code).toBe('SKU_NOT_FOUND');
    expect(error.details).toEqual({ sku: 'SKU-001' });
  });

  it.each([
    ['VALIDATION_ERROR', 'Dữ liệu chưa hợp lệ'],
    ['FORBIDDEN', 'Không có quyền thực hiện'],
    ['UNAUTHORIZED', 'Cần đăng nhập'],
    ['UNAUTHENTICATED', 'Cần đăng nhập'],
    ['SESSION_EXPIRED', 'Phiên đã hết hạn'],
    ['AUTH_UNAVAILABLE', 'Chưa thể đăng nhập lúc này'],
    ['CSRF_INVALID', 'Yêu cầu bảo mật bị từ chối'],
    ['SKU_NOT_FOUND', 'Không tìm thấy SKU'],
    ['ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng'],
    ['INSUFFICIENT_STOCK', 'Không đủ tồn kho'],
    ['INTERNAL_ERROR', 'Máy chủ gặp sự cố'],
  ])('maps %s by code and retains request ID', (code, title) => {
    expect(presentApiError(requestError(code))).toMatchObject({ title, requestId: 'req-001' });
  });

  it('uses a safe fallback for unknown and transport errors', () => {
    expect(presentApiError(requestError('FUTURE_ERROR')).title).toBe('Không thể tải dữ liệu');
    expect(presentApiError(new Error('network')).requestId).toBeUndefined();
  });

  it('rejects a malformed API error envelope', () => {
    expect(() => parseApiError({ error: { code: 9, message: 'x', request_id: 'req' } })).toThrow();
  });
});
