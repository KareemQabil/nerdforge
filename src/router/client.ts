import { ROUTER_API, type RouterTaskName } from '../types/constants.js';
import { buildPrompt, TASK_CONSTRAINTS } from './prompt-builder.js';
import { validateResponse } from '../validation/response-validator.js';
import type { z } from 'zod';

export interface RouterClientOptions {
  baseUrl: string;
  apiToken: string;
  timeoutMs: number;
  maxRetries: number;
  temperature?: Record<string, number>;
  maxTokens?: number;
}

export interface InvokeResult<T> {
  data: T;
  routedTo: string;
  requestId: string;
  raw: string;
}

/**
 * Client for the DO Inference Router.
 * Uses OpenAI-compatible chat/completions endpoint.
 * Validates responses with Zod schemas.
 * Verifies route selection via response header.
 */
export class RouterClient {
  constructor(private readonly opts: RouterClientOptions) {}

  /**
   * Send a structured prompt to the router and validate the response.
   * Retries on schema validation failure (LLM may produce bad output).
   * Aborts on misrouted requests (wrong task selected by router).
   */
  async invokeTask<T>(
    taskName: RouterTaskName,
    content: string,
    schema: z.ZodType<T>,
    options?: {
      schemaId?: string;
      extraConstraints?: string[];
      sessionId?: string;
    },
  ): Promise<InvokeResult<T>> {
    const constraints = [
      ...TASK_CONSTRAINTS[taskName],
      ...(options?.extraConstraints ?? []),
    ];

    const prompt = buildPrompt(
      taskName,
      content,
      constraints,
      options?.schemaId,
    );

    const requestId = crypto.randomUUID();
    const temperature = this.opts.temperature?.[taskName] ?? 0.1;

    let lastError = '';
    let lastRaw = '';

    for (let attempt = 0; attempt <= this.opts.maxRetries; attempt++) {
      if (attempt > 0) {
        // Exponential backoff: 1s, 2s, 4s...
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise((r) => setTimeout(r, delay));
      }

      const retryContext = attempt > 0
        ? `\n\n[RETRY_CONTEXT]\nPrevious attempt failed: ${lastError}\nYou MUST return valid JSON matching the schema.\n[/RETRY_CONTEXT]`
        : '';

      const body = {
        model: ROUTER_API.MODEL,
        messages: [
          {
            role: 'user' as const,
            content: prompt + retryContext,
          },
        ],
        temperature,
        max_tokens: this.opts.maxTokens ?? 4000,
        stream: false,
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.opts.apiToken}`,
        'X-Request-ID': requestId,
      };

      if (options?.sessionId) {
        headers[ROUTER_API.AFFINITY_HEADER] = options.sessionId;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.opts.timeoutMs);

      let response: Response;
      try {
        response = await fetch(
          `${this.opts.baseUrl}${ROUTER_API.CHAT_ENDPOINT}`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal,
          },
        );
      } catch (err: unknown) {
        clearTimeout(timeout);
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('aborted')) {
          lastError = `Request timed out after ${this.opts.timeoutMs}ms`;
        } else {
          lastError = `Network error: ${msg}`;
        }
        continue;
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        lastError = `HTTP ${response.status}: ${await response.text()}`;
        continue;
      }

      // Check which route was selected
      const routedTo = response.headers.get(ROUTER_API.ROUTE_HEADER) ?? 'unknown';

      const responseBody = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const rawContent = responseBody?.choices?.[0]?.message?.content ?? '';
      lastRaw = rawContent;

      if (!rawContent) {
        lastError = 'Empty response content from router';
        continue;
      }

      // Validate against schema
      const validated = validateResponse(schema, rawContent);

      if (!validated.success) {
        lastError = validated.error;
        continue;
      }

      return {
        data: validated.data,
        routedTo,
        requestId,
        raw: rawContent,
      };
    }

    throw new RouterError(
      `Failed after ${this.opts.maxRetries + 1} attempts for task "${taskName}".\n` +
      `Last error: ${lastError}`,
      taskName,
      requestId,
      lastRaw,
    );
  }
}

export class RouterError extends Error {
  constructor(
    message: string,
    public readonly taskName: string,
    public readonly requestId: string,
    public readonly lastRawResponse: string,
  ) {
    super(message);
    this.name = 'RouterError';
  }
}
