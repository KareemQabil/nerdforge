import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { runWorkLoop } from '../src/pipeline/work.js';
import { NerdforgeConfigSchema } from '../src/config/schema.js';
import { Paths } from '../src/storage/paths.js';
import { writeJson } from '../src/storage/artifacts.js';
import { GitOps } from '../src/git/ops.js';
import { RouterClient } from '../src/router/client.js';
import { ROUTER_TASKS } from '../src/config/tasks.js';
import type { RouterTransport } from '../src/router/types.js';

async function bootstrapRepo(): Promise<{ dir: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'nerdforge-work-'));
  const git = simpleGit({ baseDir: dir });
  await git.init();
  await git.addConfig('user.email', 'nerdforge@test.local');
  await git.addConfig('user.name', 'nerdforge test');
  await git.addConfig('commit.gpgsign', 'false');
  mkdirSync(join(dir, 'src'));
  // a "failing test" stand-in: a shell script we'll fail/pass via file content
  writeFileSync(
    join(dir, 'run-tests.sh'),
    '#!/bin/sh\ngrep -q "DONE" src/feature.txt 2>/dev/null && exit 0 || exit 1\n',
    { mode: 0o755 },
  );
  writeFileSync(join(dir, 'src/feature.txt'), 'TODO\n');
  // Match production usage: .nerdforge is gitignored so artifacts never
  // dirty the worktree.
  writeFileSync(join(dir, '.gitignore'), '.nerdforge/\n');
  await git.add('.');
  await git.commit('init');
  return { dir };
}

function chatBody(content: string): string {
  return JSON.stringify({ choices: [{ message: { content } }] });
}

const goodHygiene = {
  schema_version: 'nerdforge.hygiene.v1',
  verdict: 'PASS',
  findings: [],
  summary: 'ok',
};

const goodGate = {
  schema_version: 'nerdforge.gatekeeper.v1',
  verdict: 'PASS',
  reasons: ['failing test now passes'],
  required_changes: [],
  commit_message: 'feat: complete feature',
  evidence_checklist: [{ item: 'tests run', present: true }],
};

class ScriptedTransport implements RouterTransport {
  constructor(private readonly map: Map<string, Array<{ status: number; body: string }>>) {}
  async post(
    _url: string,
    init: { headers: Record<string, string>; body: string; timeoutMs: number },
  ): Promise<{ status: number; body: string }> {
    const task = init.headers['X-Nerdforge-Task'] ?? '';
    const queue = this.map.get(task);
    if (!queue || queue.length === 0) {
      throw new Error(`No scripted response for task ${task}`);
    }
    return queue.shift()!;
  }
}

describe('work loop integration (with mocked router + real git)', () => {
  it('drives failing → patch → passing → hygiene → gatekeeper → atomic commit', async () => {
    const { dir } = await bootstrapRepo();
    const cfg = NerdforgeConfigSchema.parse({
      workflow: {
        test_command: 'sh run-tests.sh',
        max_worker_attempts: 2,
        max_router_retries: 0,
        require_tests_pass: false,
      },
    });
    const paths = new Paths(dir, cfg);

    // Write a session + blueprint
    const sessionDir = paths.session('2026-01-01T00-00-00-000Z');
    await writeJson(paths.blueprintFile(sessionDir), {
      schema_version: 'nerdforge.blueprint.v1',
      system_name: 'sys',
      goal: 'make feature DONE',
      domain_modules: ['feature'],
      database: { entities: [], relationships: [] },
      invariants: [],
      microtasks: [
        {
          id: 'MT-001',
          title: 'flip TODO to DONE',
          description: 'change src/feature.txt content',
          expected_files: ['src/feature.txt'],
          tests: { new: [], modified: [], commands: ['sh run-tests.sh'] },
          acceptance_criteria: ['run-tests.sh exits 0'],
          invariants: [],
          tracing_proof_requirements: [],
        },
      ],
    });

    const diff =
      `diff --git a/src/feature.txt b/src/feature.txt\n` +
      `--- a/src/feature.txt\n` +
      `+++ b/src/feature.txt\n` +
      `@@ -1 +1 @@\n` +
      `-TODO\n` +
      `+DONE\n`;
    const patchResp = {
      schema_version: 'nerdforge.patch.v1',
      microtask_id: 'MT-001',
      rationale: 'replace TODO with DONE',
      diff,
      touched_files: ['src/feature.txt'],
    };

    const transport = new ScriptedTransport(
      new Map<string, Array<{ status: number; body: string }>>([
        [ROUTER_TASKS.TARGETED_IMPLEMENTATION, [{ status: 200, body: chatBody(JSON.stringify(patchResp)) }]],
        [ROUTER_TASKS.HYGIENE_AUDIT, [{ status: 200, body: chatBody(JSON.stringify(goodHygiene)) }]],
        [ROUTER_TASKS.TDD_GATEKEEPER, [{ status: 200, body: chatBody(JSON.stringify(goodGate)) }]],
      ]),
    );
    const router = new RouterClient(cfg, 'TOKEN', transport);
    const git = new GitOps(dir);
    const result = await runWorkLoop(cfg, paths, router, git, {
      microtaskId: 'MT-001',
      sessionDir,
      dryRun: false,
    });

    expect(result.status).toBe('passed');
    expect(result.attempts).toBe(1);
    expect(result.commitSha).toBeTruthy();
    expect(existsSync(result.artifactPaths.proof!)).toBe(true);

    // working tree no longer has TODO
    const content = readFileSync(join(dir, 'src/feature.txt'), 'utf8');
    expect(content).toBe('DONE\n');

    // proof.md mentions PASS verdicts
    const proof = readFileSync(result.artifactPaths.proof!, 'utf8');
    expect(proof).toContain('## Gatekeeper Verdict');
    expect(proof).toContain('**PASS**');

    rmSync(dir, { recursive: true });
  });

  it('retries on hygiene FAIL then succeeds, never producing a bad commit', async () => {
    const { dir } = await bootstrapRepo();
    const cfg = NerdforgeConfigSchema.parse({
      workflow: {
        test_command: 'sh run-tests.sh',
        max_worker_attempts: 2,
        max_router_retries: 0,
        require_tests_pass: false,
      },
    });
    const paths = new Paths(dir, cfg);
    const sessionDir = paths.session('2026-01-01T00-00-00-000Z');
    await writeJson(paths.blueprintFile(sessionDir), {
      schema_version: 'nerdforge.blueprint.v1',
      system_name: 'sys',
      goal: 'g',
      domain_modules: ['x'],
      database: { entities: [], relationships: [] },
      invariants: [],
      microtasks: [
        {
          id: 'MT-002',
          title: 't',
          description: 'd',
          expected_files: ['src/feature.txt'],
          tests: { new: [], modified: [], commands: [] },
          acceptance_criteria: ['c'],
          invariants: [],
          tracing_proof_requirements: [],
        },
      ],
    });

    const diff =
      `diff --git a/src/feature.txt b/src/feature.txt\n` +
      `--- a/src/feature.txt\n` +
      `+++ b/src/feature.txt\n` +
      `@@ -1 +1 @@\n` +
      `-TODO\n` +
      `+DONE\n`;
    const patchResp = {
      schema_version: 'nerdforge.patch.v1',
      microtask_id: 'MT-002',
      rationale: 'r',
      diff,
      touched_files: ['src/feature.txt'],
    };
    const failHygiene = {
      schema_version: 'nerdforge.hygiene.v1',
      verdict: 'FAIL',
      findings: [
        {
          severity: 'HIGH',
          rule_id: 'A1',
          file: 'src/feature.txt',
          description: 'no',
          recommendation: 'do better',
        },
      ],
      summary: 'bad',
    };

    const transport = new ScriptedTransport(
      new Map<string, Array<{ status: number; body: string }>>([
        [
          ROUTER_TASKS.TARGETED_IMPLEMENTATION,
          [
            { status: 200, body: chatBody(JSON.stringify(patchResp)) },
            { status: 200, body: chatBody(JSON.stringify(patchResp)) },
          ],
        ],
        [
          ROUTER_TASKS.HYGIENE_AUDIT,
          [
            { status: 200, body: chatBody(JSON.stringify(failHygiene)) },
            { status: 200, body: chatBody(JSON.stringify(goodHygiene)) },
          ],
        ],
        [ROUTER_TASKS.TDD_GATEKEEPER, [{ status: 200, body: chatBody(JSON.stringify(goodGate)) }]],
      ]),
    );

    const router = new RouterClient(cfg, 'TOKEN', transport);
    const git = new GitOps(dir);
    const result = await runWorkLoop(cfg, paths, router, git, {
      microtaskId: 'MT-002',
      sessionDir,
      dryRun: false,
    });
    expect(result.status).toBe('passed');
    expect(result.attempts).toBe(2);
    rmSync(dir, { recursive: true });
  });
});
