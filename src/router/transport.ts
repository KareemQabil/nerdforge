import { request } from 'undici';
import type { RouterTransport } from './types.js';

/** Production transport using undici with hard timeouts. */
export class UndiciTransport implements RouterTransport {
  async post(
    url: string,
    init: { headers: Record<string, string>; body: string; timeoutMs: number },
  ): Promise<{ status: number; body: string }> {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), init.timeoutMs);
    try {
      const res = await request(url, {
        method: 'POST',
        headers: init.headers,
        body: init.body,
        signal: ac.signal,
        headersTimeout: init.timeoutMs,
        bodyTimeout: init.timeoutMs,
      });
      const text = await res.body.text();
      return { status: res.statusCode, body: text };
    } finally {
      clearTimeout(t);
    }
  }
}
