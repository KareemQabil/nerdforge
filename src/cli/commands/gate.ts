import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadContext, makeRouter } from './_shared.js';
import { GitOps } from '../../git/ops.js';
import { readJson, writeJson, writeText, latestSession } from '../../storage/artifacts.js';
import { BlueprintSchema } from '../../schemas/blueprint.js';
import { HygieneReportSchema } from '../../schemas/hygiene.js';
import { GatekeeperVerdictSchema } from '../../schemas/gatekeeper.js';
import { ROUTER_TASKS } from '../../config/tasks.js';
import { buildPrompt, SCHEMA_TAGS } from '../../router/prompt.js';
import { NerdforgeError } from '../../utils/errors.js';
import { log } from '../../utils/logger.js';

/**
 * Run hygiene + gatekeeper on the CURRENT working-tree diff. Useful for
 * manually-applied patches the user wants graded before committing.
 */
export async function cmdGate(cwd: string, microtaskId: string): Promise<void> {
  const ctx = await loadContext(cwd);
  const router = makeRouter(ctx);
  const git = new GitOps(cwd);
  await git.assertRepo();

  const sessionDir = await latestSession(ctx.paths.sessionsRoot());
  if (!sessionDir) {
    throw new NerdforgeError(
      'No session found. Run `nerdforge blueprint` first.',
      'GATE_NO_SESSION',
    );
  }
  const bpFile = ctx.paths.blueprintFile(sessionDir);
  if (!existsSync(bpFile)) {
    throw new NerdforgeError(`Missing blueprint at ${bpFile}`, 'GATE_NO_BLUEPRINT');
  }
  const bp = BlueprintSchema.parse(await readJson(bpFile));
  const mt = bp.microtasks.find((m) => m.id === microtaskId);
  if (!mt) {
    throw new NerdforgeError(
      `Microtask ${microtaskId} not found in blueprint`,
      'GATE_MT_NOT_FOUND',
    );
  }

  await git.stageAll();
  const diff = await git.stagedDiff();
  if (!diff.trim()) {
    throw new NerdforgeError(
      'No staged changes to gate. Make and stage edits first.',
      'GATE_EMPTY_DIFF',
    );
  }
  const attemptDir = join(sessionDir, 'gate', microtaskId);
  await writeText(join(attemptDir, 'diff.staged.patch'), diff);

  const hygienePrompt = buildPrompt({
    task: ROUTER_TASKS.HYGIENE_AUDIT,
    schemaTag: SCHEMA_TAGS.HYGIENE,
    hardConstraints: [
      'audit only the diff and named files',
      'severity MUST be one of LOW|MED|HIGH',
    ],
    body: `MICROTASK_ID: ${mt.id}\n\nDIFF:\n${diff}\n\nREQUIRED_RESPONSE_SHAPE: nerdforge.hygiene.v1`,
  });
  const hygiene = await router.invokeTask(
    ROUTER_TASKS.HYGIENE_AUDIT,
    hygienePrompt,
    HygieneReportSchema,
  );
  await writeJson(join(attemptDir, 'hygiene.json'), hygiene.data);

  const gatePrompt = buildPrompt({
    task: ROUTER_TASKS.TDD_GATEKEEPER,
    schemaTag: SCHEMA_TAGS.GATEKEEPER,
    hardConstraints: [
      'one verdict only: PASS or FAIL',
      'on PASS, commit_message must be a single line under 72 chars',
    ],
    body: [
      `MICROTASK_ID: ${mt.id}`,
      `TITLE: ${mt.title}`,
      `ACCEPTANCE_CRITERIA:\n${mt.acceptance_criteria.map((a) => `- ${a}`).join('\n')}`,
      `DIFF:\n${diff}`,
      `HYGIENE_REPORT:\n${JSON.stringify(hygiene.data, null, 2)}`,
    ].join('\n\n'),
  });
  const gate = await router.invokeTask(
    ROUTER_TASKS.TDD_GATEKEEPER,
    gatePrompt,
    GatekeeperVerdictSchema,
  );
  await writeJson(join(attemptDir, 'gatekeeper.json'), gate.data);

  if (gate.data.verdict === 'PASS') {
    log.ok('gatekeeper PASS');
  } else {
    log.err('gatekeeper FAIL');
    process.exitCode = 5;
  }
  log.out({
    action: 'gate',
    microtask_id: mt.id,
    hygiene_verdict: hygiene.data.verdict,
    gatekeeper_verdict: gate.data.verdict,
    artifact_dir: attemptDir,
  });
}
