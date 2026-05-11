import type { RouterTaskName } from '../config/tasks.js';

export interface InvokeOptions {
  readonly temperature?: number;
  readonly maxTokens?: number;
  /** Caller-supplied correlation id; auto-generated if omitted. */
  readonly requestId?: string;
  /** Override per-call retry budget. */
  readonly maxRetries?: number;
}

export interface RouterCallRecord {
  readonly requestId: string;
  readonly task: RouterTaskName;
  readonly endpoint: string;
  readonly model: string;
  readonly request: unknown;
  readonly response: unknown;
  readonly rawText: string;
  readonly attempts: number;
  readonly elapsedMs: number;
}

export interface RouterTransport {
  post(
    url: string,
    init: { headers: Record<string, string>; body: string; timeoutMs: number },
  ): Promise<{ status: number; body: string }>;
}
