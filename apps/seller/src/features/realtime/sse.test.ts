import { describe, expect, it } from 'vitest';
import { SseParser } from './sse';

describe('SseParser', () => {
  it('parses named events, multi-line data and comments across chunk boundaries', () => {
    const parser = new SseParser();

    expect(parser.feed(': keep-alive\r')).toEqual([]);
    expect(parser.feed('\n\r\nevent: ready\r\ndata: {"at":"2026-10-22T00:00:00Z"}\r')).toEqual([]);
    expect(parser.feed('\n\r\nevent: change\nid: 42\ndata: first\ndata: second\n\n')).toEqual([
      { event: 'ready', data: '{"at":"2026-10-22T00:00:00Z"}' },
      { event: 'change', data: 'first\nsecond', id: '42' },
    ]);
  });

  it('keeps a lone carriage return and a split CRLF from becoming a fake blank line', () => {
    const parser = new SseParser();
    expect(parser.feed('event: change\r')).toEqual([]);
    expect(parser.feed('\ndata: {}\r\n\r\n')).toEqual([{ event: 'change', data: '{}' }]);
  });

  it('does not dispatch an event that has no data and flushes a final frame at EOF', () => {
    const parser = new SseParser();
    expect(parser.feed('event: ignored\n\n')).toEqual([]);
    expect(parser.feed('event: change\ndata: tail')).toEqual([]);
    expect(parser.end()).toEqual([{ event: 'change', data: 'tail' }]);
  });

  it('decodes UTF-8 text supplied by the transport', () => {
    const parser = new SseParser();
    expect(parser.feed('event: change\ndata: {"sku":"ÁO-01"}\n\n')).toEqual([
      { event: 'change', data: '{"sku":"ÁO-01"}' },
    ]);
  });
});
