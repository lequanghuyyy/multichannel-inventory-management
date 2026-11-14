export function channelErrorMessage(message: string): string {
  const normalized = message.trim().toLocaleLowerCase('en');
  if (normalized === 'ebay seller verification failed') {
    return 'Xác minh tài khoản eBay chưa thành công. Hãy kiểm tra quyền của tài khoản bán hàng rồi thử lại.';
  }
  if (/[à-ỹđ]/i.test(message)) return message;
  return 'Kết nối kênh chưa hoàn tất. Hãy kiểm tra trạng thái kết nối và thử lại.';
}

const capabilityMessages: Record<string, string> = {
  NOT_SUPPORTED: 'Nền tảng này chưa hỗ trợ thao tác đã chọn.',
  CONNECTOR_CAPABILITY_UNSUPPORTED: 'Chưa xác minh được kênh có hỗ trợ thao tác này.',
  FEATURE_DISABLED: 'Tính năng này chưa được bật cho kênh.',
  CHANNEL_NOT_CONNECTED: 'Kênh chưa kết nối. Hãy kết nối và kiểm tra lại trước khi thao tác.',
  SCOPE_NOT_GRANTED: 'Kết nối chưa được cấp đủ quyền để thực hiện thao tác này.',
  CAPABILITY_NOT_VERIFIED: 'Quyền thao tác chưa được kiểm tra. Hãy chạy kiểm tra kết nối kênh.',
  LIVE_VERIFICATION_REQUIRED: 'Cần hoàn tất kiểm tra với cửa hàng trước khi bật thao tác này.',
};

export function channelCapabilityMessage(code?: string, message?: string): string {
  if (code && capabilityMessages[code]) return capabilityMessages[code];
  if (code?.endsWith('_NOT_IMPLEMENTED')) return 'OctoFlow chưa hỗ trợ thao tác này trên kênh đã chọn.';
  if (message && /[à-ỹđ]/i.test(message)) return message;
  return 'Thao tác chưa sẵn sàng. Hãy kiểm tra kết nối, quyền truy cập và cấu hình kênh.';
}
