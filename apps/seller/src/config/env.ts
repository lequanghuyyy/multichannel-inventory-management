export function apiBase(raw: string = import.meta.env.VITE_API_URL ?? ''): string {
  if (!raw) return '';

  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('VITE_API_URL phải là origin HTTP(S), không có đường dẫn hoặc thông tin đăng nhập.');
  }
  return url.origin;
}

export function nativeApiBase(raw: string = import.meta.env.VITE_API_URL ?? ''): string {
  const base = apiBase(raw);
  if (!base) throw new Error('Ứng dụng di động yêu cầu VITE_API_URL là HTTPS origin của API.');

  const url = new URL(base);
  // URL.hostname retains brackets around IPv6 literals in JavaScript.
  // Normalize brackets and a trailing DNS root dot before checking loopback hosts.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (url.protocol !== 'https:' || host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host)) {
    throw new Error('Ứng dụng di động yêu cầu VITE_API_URL là HTTPS origin không phải loopback.');
  }
  return base;
}
