import fs from 'node:fs';
import path from 'node:path';
import type { NerdforgeConfig } from '../types/config.js';
import type { Microtask } from '../types/schemas.js';
import { ROUTER_TASKS } from '../types/constants.js';
import { PatchSchema, HygieneSchema, GatekeeperSchema } from '../types/schemas.js';
import { RouterClient } from '../router/client.js';
import { SessionManager } from '../storage/session-manager.js';
import { GitOperations } from '../git/operations.js';
import { runTests } from './test-runner.js';
import { applyPatch } from './patch-applier.js';
import { generateProof } from './proof-generator.js';

export interface WorkLoopOptions {
  cwd: string;
  config: NerdforgeConfig;
  client: RouterClient;
  sessions: SessionManager;
  sessionId: string;
  microtask: Microtask;
  attempt?: number;
  dryRun?: boolean;
  onGatekeeperApproved?: (diff: string, commitMessage: string) => Promise<'commit' | 'amend' | 'retry' | 'abort'>;
}

export interface WorkLoopResult {
  success: boolean;
  commitHash?: string;
  proofPath?: string;
  error?: string;
}

/**
 * Execute the full TDD work loop for a single microtask.
 * This is the core pipeline: test → patch → verify → audit → commit.
 */
export async function executeWorkLoop(opts: WorkLoopOptions): Promise<WorkLoopResult> {
  const { cwd, config, client, sessions, sessionId, microtask, dryRun } = opts;
  const maxAttempts = config.workflow.max_worker_attempts;
  const git = new GitOperations(cwd);
  const artifactPaths: Record<string, string> = {};

  // 1. Clean worktree check
  if (config.workflow.require_clean_worktree) {
    const clean = await git.isCleanWorktree();
    if (!clean) {
      return { success: false, error: 'Working tree is not clean. Commit or stash changes first.' };
    }
  }

  // 2. Create/checkout branch
  const branchName = `${config.workflow.branch_prefix}${microtask.id}`;
  if (await git.branchExists(branchName)) {
    await git.checkoutBranch(branchName);
  } else {
    await git.createBranch(branchName);
  }

  // 3. Run tests to capture failing state
  console.log('  ⏳ Running tests to capture failing state...');
  const failingResult = await runTests(config.workflow.test_command, cwd);
  const failingLog = [failingResult.stdout, failingResult.stderr].join('\n').trim();

  artifactPaths['test-failing.log'] = sessions.saveRunArtifact(
    sessionId, microtask.id, 0, 'test-failing.log', failingLog,
  );

  // 4. Worker loop: request patch → apply → test
  let lastDiff = '';
  let lastPassingLog = '';
  let lastTestResult = failingResult;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`  ⏳ Attempt ${attempt}/${maxAttempts}: requesting implementation...`);

    // Build context for the worker — include ONLY relevant snippets
    const relevantFiles = microtask.expected_files
      .filter((f) => fs.existsSync(path.join(cwd, f)))
      .map((f) => {
        const content = fs.readFileSync(path.join(cwd, f), 'utf-8');
        // Truncate large files to prevent context overflow
        const truncated = content.length > 4000
          ? content.slice(0, 4000) + '\n... (truncated)'
          : content;
        return `--- ${f} ---\n${truncated}`;
      })
      .join('\n\n');

    const retryContext = attempt > 1
      ? `\nPREVIOUS ATTEMPT FAILED:\n${lastTestResult.stderr.slice(0, 1500)}`
      : '';

    const workerContent = [
      `MICROTASK: ${microtask.title}`,
      microtask.description ? `DESCRIPTION: ${microtask.description}` : '',
      '',
      `FAILING TEST OUTPUT:`,
      failingLog.slice(0, 2000),
      '',
      `RELEVANT FILES:`,
      relevantFiles,
      retryContext,
    ].filter(Boolean).join('\n');

    // Call worker
    const patchResult = await client.invokeTask(
      ROUTER_TASKS.UNIT_TEST_IMPLEMENTATION,
      workerContent,
      PatchSchema,
      { schemaId: 'nerdforge.patch.v1' },
    );

    lastDiff = patchResult.data.diff;

    sessions.saveRunArtifact(sessionId, microtask.id, attempt, 'request.json', workerContent);
    sessions.saveRunArtifact(sessionId, microtask.id, attempt, 'response.json', patchResult.data);
    sessions.saveRunArtifact(sessionId, microtask.id, attempt, 'patch.diff', lastDiff);

    if (dryRun) {
      console.log('  🔍 Dry run — patch not applied');
      console.log(lastDiff);
      return { success: true };
    }

    // Apply patch
    console.log('  ⏳ Applying patch...');
    const applyResult = await applyPatch(lastDiff, cwd);
    if (!applyResult.success) {
      console.error(`  ✗ Patch apply failed: ${applyResult.error}`);
      sessions.saveRunArtifact(sessionId, microtask.id, attempt, 'apply-error.log', applyResult.error ?? '');
      continue;
    }

    // Run tests
    console.log('  ⏳ Running tests...');
    lastTestResult = await runTests(config.workflow.test_command, cwd);
    lastPassingLog = [lastTestResult.stdout, lastTestResult.stderr].join('\n').trim();

    artifactPaths[`test-attempt-${attempt}.log`] = sessions.saveRunArtifact(
      sessionId, microtask.id, attempt, 'test.log', lastPassingLog,
    );

    if (lastTestResult.passed) {
      console.log('  ✓ Tests pass!');
      break;
    }

    console.log(`  ✗ Tests still failing (attempt ${attempt}/${maxAttempts})`);
  }

  if (!lastTestResult.passed) {
    return { success: false, error: `Tests still failing after ${maxAttempts} attempts` };
  }

  // 5. Hygiene audit
  console.log('  ⏳ Running hygiene audit...');
  const hygieneResult = await client.invokeTask(
    ROUTER_TASKS.HYGIENE_AUDIT,
    `DIFF:\n${lastDiff}\n\nFILES CHANGED: ${microtask.expected_files.join(', ')}`,
    HygieneSchema,
    { schemaId: 'nerdforge.hygiene.v1' },
  );

  artifactPaths['hygiene.json'] = sessions.saveRunArtifact(
    sessionId, microtask.id, maxAttempts, 'hygiene.json', hygieneResult.data,
  );

  // 6. Gatekeeper
  console.log('  ⏳ Running gatekeeper...');
  const gatekeeperContent = [
    `MICROTASK: ${JSON.stringify(microtask)}`,
    `DIFF:\n${lastDiff}`,
    `TEST RESULT: ${lastTestResult.passed ? 'PASS' : 'FAIL'}`,
    `HYGIENE VERDICT: ${hygieneResult.data.verdict}`,
  ].join('\n\n');

  const gatekeeperResult = await client.invokeTask(
    ROUTER_TASKS.TDD_GATEKEEPER,
    gatekeeperContent,
    GatekeeperSchema,
    { schemaId: 'nerdforge.gatekeeper.v1' },
  );

  artifactPaths['gatekeeper.json'] = sessions.saveRunArtifact(
    sessionId, microtask.id, maxAttempts, 'gatekeeper.json', gatekeeperResult.data,
  );

  if (gatekeeperResult.data.verdict !== 'PASS') {
    console.error('  ✗ Gatekeeper FAILED');
    for (const reason of gatekeeperResult.data.reasons) {
      console.error(`    - ${reason}`);
    }
    return { success: false, error: 'Gatekeeper rejected changes' };
  }

  let userAction: 'commit' | 'amend' | 'retry' | 'abort' = 'commit';
  const commitMessage = gatekeeperResult.data.commit_message || `feat(${microtask.id}): ${microtask.title}`;

  if (opts.onGatekeeperApproved) {
    userAction = await opts.onGatekeeperApproved(lastDiff, commitMessage);
  }

  if (userAction === 'abort') {
    return { success: false, error: 'User aborted commit.' };
  }
  
  if (userAction === 'retry') {
    // Advanced: Would require wrapping the entire loop to retry. 
    // For now, abort with specific error.
    await git.resetHard();
    return { success: false, error: 'User requested retry. Changes reverted.' };
  }

  // 7. Generate proof
  const proofContent = generateProof({
    microtaskId: microtask.id,
    microtaskTitle: microtask.title,
    attempt: maxAttempts,
    failingTestLog: failingLog,
    diff: lastDiff,
    passingTestLog: lastPassingLog,
    testResult: lastTestResult,
    hygieneReport: hygieneResult.data,
    gatekeeperVerdict: gatekeeperResult.data,
    artifactPaths,
  });

  const proofPath = sessions.saveRunArtifact(
    sessionId, microtask.id, maxAttempts, 'proof.md', proofContent,
  );
  artifactPaths['proof.md'] = proofPath;

  // 8. Atomic commit
  console.log('  ⏳ Committing...');
  let commitHash = '';
  if (userAction === 'amend') {
    commitHash = await git.commitAmend(commitMessage);
  } else {
    commitHash = await git.commitAll(commitMessage);
  }

  console.log(`  ✓ Committed: ${commitHash.slice(0, 8)} — ${commitMessage}`);

  return {
    success: true,
    commitHash,
    proofPath,
  };
}
