import { describe, it, expect } from 'vitest';
import { RouterClient, extractAssistantContent, extractJsonObject } from '../src/router/client.js';
import { NerdforgeConfigSchema } from '../src/config/schema.js';
import { ROUTER_TASKS } from '../src/config/tasks.js';
import { PatchResponseSchema } from '../src/schemas/patch.js';
import { z } from 'zod';
import type { RouterTransport } from '../src/router/types.js';

function cfg() {
  return NerdforgeConfigSchema.parse({
    router: { base_url: 'http://example.invalid' },
    workflow: { max_router_retries: 2 },
  });
}

class StubTransport implements RouterTransport {
  public calls: { url: string; headers: Record<string, string>; body: string }[] = [];
  constructor(private readonly responses: Array<{ status: number; body: string }>) {}
  async post(
    url: string,
    init: { headers: Record<string, string>; body: string; timeoutMs: number },
  ): Promise<{ status: number; body: string }> {
    this.calls.push({ url, headers: init.headers, body: init.body });
    const r = this.responses.shift();
    if (!r) throw new Error('No more stub responses');
    return r;
  }
}

function chatBody(content: string): string {
  return JSON.stringify({
    choices: [{ message: { role: 'assistant', content } }],
  });
}

describe('extractAssistantContent', () => {
  it('pulls content from an OpenAI-compatible choices array', () => {
    expect(extractAssistantContent(chatBody('hello'))).toBe('hello');
  });
  it('falls back to raw body on unexpected shape', () => {
    expect(extractAssistantContent('not json at all')).toBe('not json at all');
  });
});

describe('extractJsonObject', () => {
  it('parses fenced code blocks', () => {
    const obj = extractJsonObject('```json\n{"a":1}\n```');
    expect(obj).toEqual({ a: 1 });
  });
  it('walks balanced braces to extract the first JSON object', () => {
    const obj = extractJsonObject('garbage before {"x": {"y": 2}} and trailing prose');
    expect(obj).toEqual({ x: { y: 2 } });
  });
  it('throws on missing object', () => {
    expect(() => extractJsonObject('no object here')).toThrow();
  });
});

describe('RouterClient.invokeTask', () => {
  it('posts to the OpenAI-compatible chat endpoint with required headers', async () => {
    const goodPatch = {
      schema_version: 'nerdforge.patch.v1',
      microtask_id: 'MT-001',
      rationale: 'r',
      diff: 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@\n-a\n+b\n',
      touched_files: ['x'],
    };
    const stub = new StubTransport([
      { status: 200, body: chatBody(JSON.stringify(goodPatch)) },
    ]);
    const client = new RouterClient(cfg(), 'TOKEN', stub);
    const { data, record } = await client.invokeTask(
      ROUTER_TASKS.TARGETED_IMPLEMENTATION,
      'PROMPT',
      PatchResponseSchema,
    );
    expect(data.microtask_id).toBe('MT-001');
    expect(record.attempts).toBe(1);
    expect(stub.calls[0]!.url).toBe('http://example.invalid/v1/chat/completions');
    expect(stub.calls[0]!.headers.Authorization).toBe('Bearer TOKEN');
    expect(stub.calls[0]!.headers['X-Nerdforge-Task']).toBe('unit-test-targeted-implementation');
    const sent = JSON.parse(stub.calls[0]!.body);
    expect(sent.model).toBe('router:nerdpos');
    expect(sent.messages[0].role).toBe('system');
    expect(sent.messages[1].content).toContain('PROMPT');
  });

  it('retries on schema-invalid responses up to max_router_retries', async () => {
    const stub = new StubTransport([
      { status: 200, body: chatBody('{"verdict":"PASS"}') }, // missing required fields
      { status: 200, body: chatBody('{"verdict":"PASS"}') },
      {
        status: 200,
        body: chatBody(
          JSON.stringify({ schema_version: 'nerdforge.symbol-audit.v1', verdict: 'PASS' }),
        ),
      },
    ]);
    const client = new RouterClient(cfg(), 'TOKEN', stub);
    const { data, record } = await client.invokeTask(
      ROUTER_TASKS.SYMBOL_AUDIT,
      'p',
      z.object({
        schema_version: z.literal('nerdforge.symbol-audit.v1'),
        verdict: z.enum(['PASS', 'FAIL']),
      }),
    );
    expect(data.verdict).toBe('PASS');
    expect(record.attempts).toBe(3);
  });

  it('retries on 429 and 5xx with exponential backoff', async () => {
    const stub = new StubTransport([
      { status: 429, body: 'rate limit' },
      { status: 500, body: 'boom' },
      {
        status: 200,
        body: chatBody(
          JSON.stringify({ schema_version: 'nerdforge.symbol-audit.v1', verdict: 'PASS' }),
        ),
      },
    ]);
    const client = new RouterClient(cfg(), 'TOKEN', stub);
    const { record } = await client.invokeTask(
      ROUTER_TASKS.SYMBOL_AUDIT,
      'p',
      z.object({
        schema_version: z.literal('nerdforge.symbol-audit.v1'),
        verdict: z.enum(['PASS', 'FAIL']),
      }),
    );
    expect(record.attempts).toBe(3);
  });

  it('throws on non-retryable HTTP errors (e.g. 401)', async () => {
    const stub = new StubTransport([{ status: 401, body: 'unauthorized' }]);
    const client = new RouterClient(cfg(), 'TOKEN', stub);
    await expect(
      client.invokeTask(
        ROUTER_TASKS.SYMBOL_AUDIT,
        'p',
        z.object({
          schema_version: z.literal('nerdforge.symbol-audit.v1'),
          verdict: z.enum(['PASS', 'FAIL']),
        }),
      ),
    ).rejects.toMatchObject({ code: 'ROUTER_HTTP_ERROR' });
  });

  it('rejects construction without a token', () => {
    expect(() => new RouterClient(cfg(), '', new StubTransport([]))).toThrow();
  });

  it('rejects unknown task ids', async () => {
    const stub = new StubTransport([]);
    const client = new RouterClient(cfg(), 'TOKEN', stub);
    await expect(
      // @ts-expect-error intentional
      client.invokeTask('nope', 'p', PatchResponseSchema),
    ).rejects.toMatchObject({ code: 'ROUTER_UNKNOWN_TASK' });
  });
});
