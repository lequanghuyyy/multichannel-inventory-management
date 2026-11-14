import { describe, expect, it } from 'vitest';
import { apiBase, nativeApiBase } from './env';

describe('public API environment', () => {
  it('uses the Vite proxy when no public API origin is configured', () => {
    expect(apiBase('')).toBe('');
  });

  it('normalizes an origin-only HTTP(S) base URL', () => {
    expect(apiBase('https://api.example.test/')).toBe('https://api.example.test');
  });

  it.each([
    'file:///tmp/api',
    'https://user:password@example.test',
    'https://api.example.test/api',
    'https://api.example.test?key=value',
    'https://api.example.test#fragment',
  ])('rejects unsafe public API configuration: %s', (value) => {
    expect(() => apiBase(value)).toThrow();
  });

  it.each(['', 'http://api.example.test', 'https://localhost', 'https://localhost.', 'https://127.0.0.1', 'https://[::1]'])('rejects an unsafe native API base: %s', (value) => {
    expect(() => nativeApiBase(value)).toThrow();
  });

  it('accepts only a non-loopback HTTPS native origin', () => {
    expect(nativeApiBase('https://api.example.test/')).toBe('https://api.example.test');
  });
});
