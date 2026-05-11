import { join } from 'node:path';
import type { NerdforgeConfig } from '../config/schema.js';
import type { Paths } from '../storage/paths.js';
import type { RouterClient } from '../router/client.js';
import type { GitOps } from '../git/ops.js';
import {
  BlueprintSchema,
  type Blueprint,
  type BlueprintMicrotask,
} from '../schemas/blueprint.js';
import { PatchResponseSchema } from '../schemas/patch.js';
import { HygieneReportSchema, type HygieneReport } from '../schemas/hygiene.js';
import {
  GatekeeperVerdictSchema,
  type GatekeeperVerdict,
} from '../schemas/gatekeeper.js';
import { ROUTER_TASKS } from '../config/tasks.js';
import { buildPrompt, SCHEMA_TAGS } from '../router/prompt.js';
import { writeJson, writeText, readJson } from '../storage/artifacts.js';
import { runCommand, formatCommandLog } from '../runner/tests.js';
import { renderProof } from './proof.js';
import { NerdforgeError } from '../utils/errors.js';
import { log } from '../utils/logger.js';
import { patchState, readState } from '../storage/state.js';

export interface WorkOptions {
  microtaskId: string;
  sessionDir: string;
  dryRun: boolean;
}

export interface WorkResult {
  status: 'passed' | 'failed';
  attempts: number;
  commitSha: string | null;
  artifactPaths: Record<string, string>;
  gatekeeper: GatekeeperVerdict | null;
  hygiene: HygieneReport | null;
}

/**
 * Run the full TDD loop for a single microtask:
 *   clean worktree → branch → failing test → worker → patch → tests →
 *   hygiene → gatekeeper → atomic commit + proof.md.
 *
 * Each attempt writes its own artifact subdirectory so the run is fully replayable.
 */
export async function runWorkLoop(
  cfg: NerdforgeConfig,
  paths: Paths,
  router: RouterClient,
  git: GitOps,
  opts: WorkOptions,
): Promise<WorkResult> {
  await git.assertRepo();

  const blueprint = await loadBlueprint(paths.blueprintFile(opts.sessionDir));
  const mt = blueprint.microtasks.find((m) => m.id === opts.microtaskId);
  if (!mt) {
    throw new NerdforgeError(
      `Microtask ${opts.microtaskId} not found in blueprint`,
      'WORK_MT_NOT_FOUND',
    );
  }

  if (cfg.workflow.require_clean_worktree && !(await git.isClean())) {
    throw new NerdforgeError(
      'Working tree is dirty. Commit or stash first, or set workflow.require_clean_worktree=false.',
      'WORK_DIRTY_WORKTREE',
    );
  }

  const branch = `${cfg.workflow.branch_prefix}${mt.id}`;
  await git.createBranch(branch);
  await patchState(paths.state(), { currentBranch: branch });
  log.info(`Working on ${mt.id} on branch ${branch}`);

  // Baseline run captures the failing-test log we feed to attempt 1.
  const baseline = await runCommand(cfg.workflow.test_command, git.cwd);
  if (baseline.exitCode === 0 && cfg.workflow.require_tests_pass) {
    log.warn(
      'Test command exits 0 BEFORE any change. Either the failing test is missing or it is not yet in the suite.',
    );
  }

  const max = cfg.workflow.max_worker_attempts;
  let lastFailingLog = formatCommandLog(baseline);

  for (let attempt = 1; attempt <= max; attempt += 1) {
    const attemptDir = paths.attemptDir(opts.sessionDir, mt.id, attempt);
    log.step(attempt, max, `Attempt ${attempt}`);

    const failingLogPath = join(attemptDir, 'test.failing.log');
    await writeText(failingLogPath, lastFailingLog);

    const workerPrompt = buildWorkerPrompt(mt, lastFailingLog, blueprint.system_name);
    const requestPath = join(attemptDir, 'request.json');
    await writeJson(requestPath, {
      task: ROUTER_TASKS.TARGETED_IMPLEMENTATION,
      microtask_id: mt.id,
      attempt,
      prompt: workerPrompt,
    });

    if (opts.dryRun) {
      log.warn('dry-run: stopping before router call');
      return {
        status: 'failed',
        attempts: attempt - 1,
        commitSha: null,
        artifactPaths: { attemptDir, failingLog: failingLogPath, request: requestPath },
        gatekeeper: null,
        hygiene: null,
      };
    }

    let patchResp;
    try {
      patchResp = await router.invokeTask(
        ROUTER_TASKS.TARGETED_IMPLEMENTATION,
        workerPrompt,
        PatchResponseSchema,
      );
    } catch (e) {
      log.err(`router error on attempt ${attempt}: ${(e as Error).message}`);
      await writeJson(join(attemptDir, 'response.error.json'), {
        message: (e as Error).message,
      });
      continue;
    }
    const responsePath = join(attemptDir, 'response.json');
    await writeJson(responsePath, patchResp.record);
    const patchPath = join(attemptDir, 'patch.diff');
    await writeText(patchPath, patchResp.data.diff);

    try {
      await git.applyPatch(patchResp.data.diff, attemptDir);
    } catch (e) {
      log.err(`patch apply failed: ${(e as Error).message}`);
      lastFailingLog = `Patch apply failed for attempt ${attempt}: ${(e as Error).message}\n${lastFailingLog}`;
      continue;
    }

    const tested = await runCommand(cfg.workflow.test_command, git.cwd);
    const passingLogPath = join(attemptDir, 'test.log');
    await writeText(passingLogPath, formatCommandLog(tested));
    if (tested.exitCode !== 0) {
      log.warn(`tests still failing on attempt ${attempt}`);
      lastFailingLog = formatCommandLog(tested);
      await git.hardResetToHead();
      continue;
    }
    log.ok(`tests pass on attempt ${attempt}`);

    const diffText = patchResp.data.diff;
    const hygienePrompt = buildHygienePrompt(mt, diffText);
    const hygiene = await router.invokeTask(
      ROUTER_TASKS.HYGIENE_AUDIT,
      hygienePrompt,
      HygieneReportSchema,
    );
    const hygienePath = join(attemptDir, 'hygiene.json');
    await writeJson(hygienePath, hygiene.data);

    if (hygiene.data.verdict === 'FAIL') {
      log.err('hygiene FAIL — reverting and retrying');
      lastFailingLog = `${formatCommandLog(tested)}\n--- hygiene FAIL ---\n${JSON.stringify(hygiene.data, null, 2)}`;
      await git.hardResetToHead();
      continue;
    }

    const gatePrompt = buildGatekeeperPrompt(
      mt,
      diffText,
      tested.stdout + '\n' + tested.stderr,
      hygiene.data,
    );
    const gate = await router.invokeTask(
      ROUTER_TASKS.TDD_GATEKEEPER,
      gatePrompt,
      GatekeeperVerdictSchema,
    );
    const gatePath = join(attemptDir, 'gatekeeper.json');
    await writeJson(gatePath, gate.data);

    if (gate.data.verdict !== 'PASS') {
      log.err('gatekeeper FAIL — reverting and retrying');
      lastFailingLog = `${formatCommandLog(tested)}\n--- gatekeeper FAIL ---\n${JSON.stringify(gate.data, null, 2)}`;
      await git.hardResetToHead();
      continue;
    }

    const artifactPaths = {
      request: requestPath,
      response: responsePath,
      patch: patchPath,
      failingLog: failingLogPath,
      passingLog: passingLogPath,
      hygiene: hygienePath,
      gatekeeper: gatePath,
    };
    const proofMd = renderProof({
      microtask: mt,
      attempts: attempt,
      failingTestLog: lastFailingLog,
      passingTestLog: formatCommandLog(tested),
      passingResult: tested,
      hygiene: hygiene.data,
      gatekeeper: gate.data,
      artifactPaths,
    });
    const proofPath = join(attemptDir, 'proof.md');
    await writeText(proofPath, proofMd);

    const message = composeCommitMessage(mt, gate.data, proofPath);
    const sha = await git.atomicCommit(message);
    log.ok(`committed ${sha.slice(0, 8)}`);

    const prev = await readState(paths.state());
    await patchState(paths.state(), {
      microtasks: {
        ...prev.microtasks,
        [mt.id]: {
          status: 'passed',
          lastAttempt: attempt,
          lastUpdated: new Date().toISOString(),
          lastCommitSha: sha,
        },
      },
    });

    return {
      status: 'passed',
      attempts: attempt,
      commitSha: sha,
      artifactPaths: { ...artifactPaths, proof: proofPath },
      gatekeeper: gate.data,
      hygiene: hygiene.data,
    };
  }

  const prev = await readState(paths.state());
  await patchState(paths.state(), {
    microtasks: {
      ...prev.microtasks,
      [mt.id]: {
        status: 'failed',
        lastAttempt: max,
        lastUpdated: new Date().toISOString(),
        lastCommitSha: null,
      },
    },
  });
  return {
    status: 'failed',
    attempts: max,
    commitSha: null,
    artifactPaths: {},
    gatekeeper: null,
    hygiene: null,
  };
}

async function loadBlueprint(file: string): Promise<Blueprint> {
  const raw = await readJson<unknown>(file);
  const parsed = BlueprintSchema.safeParse(raw);
  if (!parsed.success) {
    throw new NerdforgeError(
      `Blueprint at ${file} is invalid: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
      'WORK_BAD_BLUEPRINT',
    );
  }
  return parsed.data;
}

function composeCommitMessage(
  mt: BlueprintMicrotask,
  gate: GatekeeperVerdict,
  proofPath: string,
): string {
  if (gate.commit_message && gate.commit_message.trim().length > 0) {
    return `${gate.commit_message.trim()}\n\nProof: ${proofPath}\nMicrotask: ${mt.id}`;
  }
  return `${mt.id}: ${mt.title}\n\nProof: ${proofPath}`;
}

// ---------------- prompt builders ----------------

function buildWorkerPrompt(
  mt: BlueprintMicrotask,
  failingLog: string,
  systemName: string,
): string {
  const body = [
    `SYSTEM: ${systemName}`,
    `MICROTASK_ID: ${mt.id}`,
    `TITLE: ${mt.title}`,
    `DESCRIPTION: ${mt.description}`,
    `EXPECTED_FILES: ${JSON.stringify(mt.expected_files)}`,
    `ACCEPTANCE_CRITERIA:\n${mt.acceptance_criteria.map((a) => `- ${a}`).join('\n')}`,
    `INVARIANTS:\n${mt.invariants.map((a) => `- ${a}`).join('\n') || '- (none)'}`,
    `FAILING_TEST_OUTPUT (truncated):\n${truncate(failingLog, 6000)}`,
    `REQUIRED_RESPONSE_SHAPE (nerdforge.patch.v1):`,
    JSON.stringify(
      {
        schema_version: 'nerdforge.patch.v1',
        microtask_id: mt.id,
        rationale: '<one short paragraph>',
        diff: '<unified diff string; MUST begin with "diff --git" headers>',
        touched_files: ['<paths relative to repo root>'],
        notes: '',
      },
      null,
      2,
    ),
  ].join('\n\n');
  return buildPrompt({
    task: ROUTER_TASKS.TARGETED_IMPLEMENTATION,
    schemaTag: SCHEMA_TAGS.PATCH,
    hardConstraints: [
      'unified diff only inside the `diff` field',
      'minimal change scoped to making the failing test pass',
      'no refactor, no formatting churn, no unrelated edits',
      'do not invent files outside `expected_files` unless strictly required',
      'reference only symbols proven to exist in the repo',
    ],
    body,
  });
}

function buildHygienePrompt(mt: BlueprintMicrotask, diff: string): string {
  const body = [
    `MICROTASK_ID: ${mt.id}`,
    `DIFF (truncated):`,
    truncate(diff, 8000),
    `REQUIRED_RESPONSE_SHAPE (nerdforge.hygiene.v1):`,
    JSON.stringify(
      {
        schema_version: 'nerdforge.hygiene.v1',
        verdict: 'PASS|WARN|FAIL',
        findings: [
          {
            severity: 'LOW|MED|HIGH',
            rule_id: '<rule identifier>',
            file: '<path>',
            description: '<short>',
            recommendation: '<short>',
          },
        ],
        summary: '<short>',
      },
      null,
      2,
    ),
  ].join('\n\n');
  return buildPrompt({
    task: ROUTER_TASKS.HYGIENE_AUDIT,
    schemaTag: SCHEMA_TAGS.HYGIENE,
    hardConstraints: [
      'audit only the diff and named files',
      'no implementation suggestions in code form',
      'severity MUST be one of LOW|MED|HIGH',
    ],
    body,
  });
}

function buildGatekeeperPrompt(
  mt: BlueprintMicrotask,
  diff: string,
  testOutput: string,
  hygiene: HygieneReport,
): string {
  const body = [
    `MICROTASK_ID: ${mt.id}`,
    `TITLE: ${mt.title}`,
    `ACCEPTANCE_CRITERIA:\n${mt.acceptance_criteria.map((a) => `- ${a}`).join('\n')}`,
    `INVARIANTS:\n${mt.invariants.map((a) => `- ${a}`).join('\n') || '- (none)'}`,
    `DIFF (truncated):\n${truncate(diff, 6000)}`,
    `TEST_OUTPUT (truncated):\n${truncate(testOutput, 4000)}`,
    `HYGIENE_REPORT:\n${JSON.stringify(hygiene, null, 2)}`,
    `REQUIRED_RESPONSE_SHAPE (nerdforge.gatekeeper.v1):`,
    JSON.stringify(
      {
        schema_version: 'nerdforge.gatekeeper.v1',
        verdict: 'PASS|FAIL',
        reasons: ['<one bullet per reason>'],
        required_changes: ['<empty if PASS>'],
        commit_message: '<conventional-commit-style line, present if PASS>',
        evidence_checklist: [
          { item: 'tests run', present: true },
          { item: 'diff scoped to expected_files', present: true },
          { item: 'hygiene non-FAIL', present: true },
        ],
      },
      null,
      2,
    ),
  ].join('\n\n');
  return buildPrompt({
    task: ROUTER_TASKS.TDD_GATEKEEPER,
    schemaTag: SCHEMA_TAGS.GATEKEEPER,
    hardConstraints: [
      'one verdict only: PASS or FAIL',
      'on PASS, commit_message must be a single line under 72 chars',
      'on FAIL, required_changes must be non-empty',
    ],
    body,
  });
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}\n…[truncated]` : s;
}
