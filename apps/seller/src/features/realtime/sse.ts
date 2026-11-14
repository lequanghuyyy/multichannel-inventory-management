export interface SseMessage {
  event: string;
  data: string;
  id?: string;
  retry?: number;
}

const lineBreak = /[\r\n]/;

export class SseParser {
  private buffer = '';
  private eventName = '';
  private dataLines: string[] = [];
  private lastId = '';
  private retry: number | undefined;

  feed(chunk: string): SseMessage[] {
    this.buffer += chunk;
    const messages: SseMessage[] = [];
    for (;;) {
      const boundary = this.buffer.search(lineBreak);
      if (boundary < 0) break;
      const marker = this.buffer[boundary];
      if (marker === '\r' && boundary === this.buffer.length - 1) break;
      const width = marker === '\r' && this.buffer[boundary + 1] === '\n' ? 2 : 1;
      const line = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + width);
      const message = this.consumeLine(line);
      if (message) messages.push(message);
    }
    return messages;
  }

  end(): SseMessage[] {
    if (this.buffer !== '') {
      const line = this.buffer;
      this.buffer = '';
      this.consumeLine(line);
    }
    const message = this.dispatch();
    return message ? [message] : [];
  }

  private consumeLine(line: string): SseMessage | null {
    if (line === '') return this.dispatch();
    if (line.startsWith(':')) return null;

    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    switch (field) {
      case 'event':
        this.eventName = value;
        break;
      case 'data':
        this.dataLines.push(value);
        break;
      case 'id':
        if (!value.includes('\0')) this.lastId = value;
        break;
      case 'retry': {
        const parsed = Number(value);
        if (Number.isInteger(parsed) && parsed >= 0) this.retry = parsed;
        break;
      }
      default:
        break;
    }
    return null;
  }

  private dispatch(): SseMessage | null {
    const event = this.eventName || 'message';
    const data = this.dataLines.join('\n');
    const message = data === '' ? null : {
      event,
      data,
      ...(this.lastId !== '' ? { id: this.lastId } : {}),
      ...(this.retry !== undefined ? { retry: this.retry } : {}),
    };
    this.eventName = '';
    this.dataLines = [];
    return message;
  }
}
