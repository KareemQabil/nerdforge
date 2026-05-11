import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { NerdforgeConfig } from '../config/schema.js';
import { ROUTER_TASKS, type RouterTaskName } from '../config/tasks.js';
import { NerdforgeError } from '../utils/errors.js';
import { sleep } from '../utils/time.js';
import { buildSystemMessage } from './prompt.js';
import { UndiciTransport } from './transport.js';
import type { InvokeOptions, RouterCallRecord, RouterTransport } from './types.js';

/**
 * RouterClient — the single integration boundary with the DigitalOcean
 * Inference Router. Speaks the OpenAI-compatible `/v1/chat/completions` shape
 * and enforces:
 *   - hard timeouts
 *   - exponential backoff retries
 *   - strict JSON extraction
 *   - schema validation via the caller-supplied Zod schema
 *
 * The transport is injected so tests can supply a deterministic mock.
 */
export class RouterClient {
  private readonly token: string;
  private readonly transport: RouterTransport;

  constructor(
    private readonly cfg: NerdforgeConfig,
    token: string,
    transport?: RouterTransport,
  ) {
    if (!token) {
      throw new NerdforgeError(
        `Missing token; set ${cfg.auth.do_api_token_env}`,
        'AUTH_MISSING_TOKEN',
      );
    }
    this.token = token;
    this.transport = transport ?? new UndiciTransport();
  }

  endpoint(): string {
    return `${this.cfg.router.base_url.replace(/\/$/, '')}/v1/chat/completions`;
  }

  private temperatureFor(task: RouterTaskName): number {
    const t = this.cfg.models.temperature?.[task];
    return typeof t === 'number' ? t : 0.1;
  }

  async invokeTask<S extends z.ZodTypeAny>(
    task: RouterTaskName,
    fullPrompt: string,
    schema: S,
    options: InvokeOptions = {},
  ): Promise<{ data: z.output<S>; record: RouterCallRecord }> {
    if (!Object.values(ROUTER_TASKS).includes(task)) {
      throw new NerdforgeError(`Unknown router task: ${task}`, 'ROUTER_UNKNOWN_TASK');
    }
    const requestId = options.requestId ?? randomUUID();
    const maxRetries = options.maxRetries ?? this.cfg.workflow.max_router_retries;
    const start = Date.now();

    const requestBody = {
      model: this.cfg.router.model,
      messages: [
        { role: 'system', content: buildSystemMessage(task) },
        { role: 'user', content: fullPrompt },
      ],
      temperature: options.temperature ?? this.temperatureFor(task),
      max_tokens: options.maxTokens ?? this.cfg.models.max_tokens.default,
      stream: false,
      response_format: { type: 'json_object' } as const,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
      'X-Nerdforge-Request-Id': requestId,
      'X-Nerdforge-Task': task,
    };

    let attempt = 0;
    let lastErr: NerdforgeError | undefined;
    let rawText = '';
    let lastBody = '';

    while (attempt <= maxRetries) {
      attempt += 1;
      try {
        const res = await this.transport.post(this.endpoint(), {
          headers,
          body: JSON.stringify(requestBody),
          timeoutMs: this.cfg.router.timeout_ms,
        });
        lastBody = res.body;

        if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
          lastErr = new NerdforgeError(
            `Router HTTP ${res.status}: ${truncate(res.body, 500)}`,
            'ROUTER_HTTP_RETRYABLE',
          );
          await backoff(attempt);
          continue;
        }
        if (res.status < 200 || res.status >= 300) {
          throw new NerdforgeError(
            `Router HTTP ${res.status}: ${truncate(res.body, 1000)}`,
            'ROUTER_HTTP_ERROR',
            { status: res.status, body: res.body },
          );
        }

        rawText = extractAssistantContent(res.body);
        const json = extractJsonObject(rawText);
        const parsed = schema.safeParse(json);
        if (!parsed.success) {
          lastErr = new NerdforgeError(
            `Schema validation failed for task ${task}: ${parsed.error.issues
              .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
              .join('; ')}`,
            'ROUTER_SCHEMA_INVALID',
            { rawText, issues: parsed.error.issues },
          );
          await backoff(attempt);
          continue;
        }

        return {
          data: parsed.data,
          record: {
            requestId,
            task,
            endpoint: this.endpoint(),
            model: this.cfg.router.model,
            request: requestBody,
            response: safeJson(res.body),
            rawText,
            attempts: attempt,
            elapsedMs: Date.now() - start,
          },
        };
      } catch (e) {
        if (e instanceof NerdforgeError && e.code === 'ROUTER_HTTP_ERROR') {
          throw e;
        }
        const msg = e instanceof Error ? e.message : String(e);
        lastErr = new NerdforgeError(
          `Router transport error: ${msg}`,
          'ROUTER_TRANSPORT',
          { cause: msg },
        );
        await backoff(attempt);
      }
    }

    throw (
      lastErr ??
      new NerdforgeError(
        `Router task ${task} failed after ${attempt} attempts. Last body: ${truncate(lastBody, 500)}`,
        'ROUTER_EXHAUSTED',
      )
    );
  }
}

function backoff(attempt: number): Promise<void> {
  const base = 250;
  const jitter = Math.random() * 100;
  const delay = Math.min(base * 2 ** (attempt - 1), 4000) + jitter;
  return sleep(delay);
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

/**
 * Extract the assistant message content from an OpenAI-compatible response.
 * Falls back to the body itself so JSON extraction can still try.
 */
export function extractAssistantContent(body: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return body;
  }
  const obj = parsed as {
    choices?: Array<{
      message?: { content?: unknown; reasoning_content?: unknown };
    }>;
  };
  const msg = obj?.choices?.[0]?.message;
  const content = msg?.content;
  if (typeof content === 'string') return content;
  if (typeof msg?.reasoning_content === 'string') return msg.reasoning_content;
  return body;
}

/**
 * Pull the first balanced JSON object from a string. Tolerates accidental
 * code fences or prose wrapped around the JSON payload.
 */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const raw = fenced ? fenced[1]! : trimmed;
  try {
    return JSON.parse(raw);
  } catch {
    /* fall through */
  }
  const start = raw.indexOf('{');
  if (start < 0) {
    throw new NerdforgeError(
      `Response did not contain a JSON object. Got: ${truncate(raw, 200)}`,
      'ROUTER_NO_JSON',
    );
  }
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        const candidate = raw.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch (e) {
          throw new NerdforgeError(
            `Found JSON-shaped block but JSON.parse failed: ${(e as Error).message}`,
            'ROUTER_BAD_JSON',
          );
        }
      }
    }
  }
  throw new NerdforgeError(
    `Unterminated JSON object in response: ${truncate(raw, 200)}`,
    'ROUTER_UNTERMINATED_JSON',
  );
}
