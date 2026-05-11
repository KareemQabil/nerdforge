import type { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import chalk from 'chalk';
import { loadConfigStrict, resolveAuthToken } from '../../config/loader.js';
import { runInteractiveSetup } from '../interactive/setup.js';
import { runSymbolAudit } from '../../audit/symbol-audit.js';
import {
  introBanner,
  outroBanner,
  askGoal,
  showMainMenu,
  selectMicrotasks,
  confirmDiff,
  confirmGatekeeperOverride,
} from '../../ui/components.js';
import { generateRepoMap } from '../../repomap/generator.js';
import { RouterClient, RouterError } from '../../router/client.js';
import { SessionManager } from '../../storage/session-manager.js';
import { StateManager } from '../../storage/state-manager.js';
import { GitOperations } from '../../git/operations.js';
import { ROUTER_TASKS, ARTIFACTS_DIR } from '../../types/constants.js';
import {
  BlueprintSchema,
  HygieneSchema,
  GatekeeperSchema,
} from '../../types/schemas.js';
import type { NerdforgeConfig } from '../../types/config.js';
import type { Microtask } from '../../types/schemas.js';
import type { RepoMap } from '../../types/repomap.js';
import { executeWorkLoop } from '../../pipeline/work-loop.js';

type MicrotaskLike = {
  id?: string;
  title: string;
  description?: string;
  expected_files?: string[];
  tests?: {
    new?: string[];
    modified?: string[];
  };
  acceptance_criteria?: string[];
  tracing_proof_requirements?: string[];
};

interface InteractiveContext {
  cwd: string;
  config: NerdforgeConfig;
  client: RouterClient;
  sessions: SessionManager;
  stateManager: StateManager;
}

interface ActiveMicrotaskSession {
  sessionId: string;
  microtasks: Microtask[];
}

export function registerInteractiveCommand(program: Command): void {
  program.action(async () => {
    introBanner();

    const cwd = process.cwd();
    await runInteractiveSetup(cwd);

    const config = loadConfigStrict(cwd);
    const token = resolveAuthToken(config);
    const context: InteractiveContext = {
      cwd,
      config,
      client: new RouterClient({
        baseUrl: config.router.base_url,
        apiToken: token,
        timeoutMs: config.router.timeout_ms,
        maxRetries: config.workflow.max_router_retries,
        temperature: config.models.temperature,
        maxTokens: config.models.max_tokens.default,
      }),
      sessions: new SessionManager(cwd),
      stateManager: new StateManager(cwd),
    };

    while (true) {
      try {
        const state = context.stateManager.load();
        const hasPendingTasks = Boolean(state.currentSessionId) && state.pendingMicrotasks.length > 0;
        const action = await showMainMenu(hasPendingTasks);

        if (action === 'exit') {
          outroBanner('Goodbye.');
          return;
        }

        if (action === 'status') {
          await showProjectStatus(context);
          continue;
        }

        if (action === 'gatekeeper') {
          await auditUncommittedChanges(context);
          continue;
        }

        if (action === 'new_blueprint') {
          const activeSession = await createBlueprintSession(context);
          if (activeSession) {
            await runSelectedMicrotasks(context, activeSession);
          }
          continue;
        }

        if (action === 'resume_microtasks') {
          const activeSession = loadPendingMicrotasks(context);
          if (activeSession) {
            await runSelectedMicrotasks(context, activeSession);
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        p.log.error(`Error: ${message}`);
        if (err instanceof RouterError && err.lastRawResponse) {
          p.note(err.lastRawResponse.slice(0, 2400), 'Last Router Response');
        }
        if (err instanceof Error && err.stack) {
          p.log.error(err.stack);
        }
      }
    }
  });
}

function normalizeMicrotasks(microtasks: MicrotaskLike[] = []): Microtask[] {
  return microtasks.map((mt, index) => ({
    id: mt.id || `MT-${String(index + 1).padStart(3, '0')}`,
    title: mt.title,
    description: mt.description ?? '',
    expected_files: mt.expected_files ?? [],
    tests: {
      new: mt.tests?.new ?? [],
      modified: mt.tests?.modified ?? [],
    },
    acceptance_criteria: mt.acceptance_criteria ?? [],
    tracing_proof_requirements: mt.tracing_proof_requirements ?? [],
  }));
}

function buildBlueprintPrompt(goal: string, repoMap: RepoMap): string {
  const repoSummary = repoMap.files
    .map((file) => `  ${file.path} (${file.size_bytes}b)`)
    .join('\n');

  return [
    `GOAL: ${goal}`,
    '',
    `REPOSITORY MAP (${repoMap.total_files} files):`,
    repoSummary,
  ].join('\n');
}

async function createBlueprintSession(context: InteractiveContext): Promise<ActiveMicrotaskSession | null> {
  const goal = await askGoal();
  if (!goal) {
    p.log.info('Blueprint creation cancelled.');
    return null;
  }

  const spinner = p.spinner();
  spinner.start('Generating repository map...');

  const repoMap = await generateRepoMap(context.cwd, context.config);
  fs.writeFileSync(
    path.join(context.cwd, ARTIFACTS_DIR, 'repo-map.json'),
    JSON.stringify(repoMap, null, 2),
  );

  spinner.message('Designing architecture blueprint...');
  const blueprintResult = await context.client.invokeTask(
    ROUTER_TASKS.ARCHITECTURE_BLUEPRINT,
    buildBlueprintPrompt(goal, repoMap),
    BlueprintSchema,
    { schemaId: 'nerdforge.blueprint.v1' },
  );

  const sessionId = context.sessions.createSession();
  context.sessions.saveArtifact(sessionId, 'blueprint.json', blueprintResult.data);

  const microtasks = normalizeMicrotasks(blueprintResult.data.microtasks);
  context.sessions.saveArtifact(sessionId, 'microtasks.json', microtasks);

  spinner.message('Running symbol audit...');
  const symbolAudit = await runSymbolAudit({
    blueprint: blueprintResult.data,
    client: context.client,
    repoMap,
  });
  context.sessions.saveArtifact(sessionId, 'symbol-audit.json', symbolAudit.audit);
  if (symbolAudit.diagnostics) {
    context.sessions.saveArtifact(sessionId, 'symbol-audit-diagnostics.json', {
      ...symbolAudit.diagnostics,
      effectiveVerdict: symbolAudit.effectiveVerdict,
      mode: symbolAudit.mode,
    });
  }

  spinner.stop(`Blueprint complete. Found ${microtasks.length} microtasks.`);

  if (symbolAudit.mode === 'fallback') {
    p.log.warn('Router symbol audit failed, so Nerdforge used the local deterministic fallback audit.');
  }

  if (symbolAudit.analysis.advisory.length > 0) {
    p.log.warn(chalk.yellow('Symbol audit produced advisory items for planned new files or symbols:'));
    for (const mismatch of symbolAudit.analysis.advisory.slice(0, 8)) {
      p.log.warn(`  - ${mismatch.name} in ${mismatch.expected_location}`);
    }
    if (symbolAudit.analysis.advisory.length > 8) {
      p.log.warn(`  ...and ${symbolAudit.analysis.advisory.length - 8} more advisory items.`);
    }
  }

  if (symbolAudit.effectiveVerdict !== 'PASS') {
    p.log.warn(chalk.yellow('The blueprint has blocking symbol audit issues:'));
    for (const mismatch of symbolAudit.analysis.blocking) {
      p.log.warn(`  - ${mismatch.kind}: ${mismatch.name} in ${mismatch.expected_location}`);
      if (mismatch.notes) {
        p.log.warn(`    ${mismatch.notes}`);
      }
    }
    const proceed = await p.confirm({
      message: 'Proceed with this blueprint anyway?',
      initialValue: false,
    });
    if (p.isCancel(proceed) || !proceed) {
      p.log.warn('Blueprint saved to artifacts, but not activated.');
      return null;
    }
  } else {
    p.log.success('Symbol audit passed.');
  }

  context.stateManager.update({
    currentBlueprintId: sessionId,
    currentSessionId: sessionId,
    lastAuditTimestamp: new Date().toISOString(),
    pendingMicrotasks: microtasks.map((microtask) => microtask.id),
    completedMicrotasks: [],
  });

  p.log.success(`Blueprint created: ${blueprintResult.data.system_name}`);
  p.log.message(`Session: ${sessionId}`);
  p.log.message(`Microtasks: ${microtasks.length}`);

  return {
    sessionId,
    microtasks,
  };
}

function loadPendingMicrotasks(context: InteractiveContext): ActiveMicrotaskSession | null {
  const state = context.stateManager.load();

  if (!state.currentSessionId || state.pendingMicrotasks.length === 0) {
    p.log.warn('There are no pending microtasks to resume.');
    return null;
  }

  const storedMicrotasks = context.sessions.loadArtifact<Microtask[]>(
    state.currentSessionId,
    'microtasks.json',
  );

  if (!storedMicrotasks) {
    p.log.error('Could not load microtasks for the active session.');
    return null;
  }

  const pendingMicrotasks = storedMicrotasks.filter((microtask) =>
    state.pendingMicrotasks.includes(microtask.id),
  );

  if (pendingMicrotasks.length === 0) {
    p.log.warn('Pending state exists, but no matching microtasks were found.');
    return null;
  }

  return {
    sessionId: state.currentSessionId,
    microtasks: pendingMicrotasks,
  };
}

async function auditUncommittedChanges(context: InteractiveContext): Promise<void> {
  const git = new GitOperations(context.cwd);
  const diff = await git.getDiff();

  if (!diff) {
    p.log.warn('No uncommitted changes to audit.');
    return;
  }

  const spinner = p.spinner();
  spinner.start('Running hygiene audit...');
  const hygiene = await context.client.invokeTask(
    ROUTER_TASKS.HYGIENE_AUDIT,
    `DIFF:\n${diff}`,
    HygieneSchema,
    { schemaId: 'nerdforge.hygiene.v1' },
  );

  spinner.message(`Hygiene verdict: ${hygiene.data.verdict}`);
  spinner.message('Running gatekeeper...');
  const gatekeeper = await context.client.invokeTask(
    ROUTER_TASKS.TDD_GATEKEEPER,
    `DIFF:\n${diff}\nHYGIENE: ${hygiene.data.verdict}`,
    GatekeeperSchema,
    { schemaId: 'nerdforge.gatekeeper.v1' },
  );
  spinner.stop('Audit complete.');

  context.stateManager.update({ lastAuditTimestamp: new Date().toISOString() });

  if (gatekeeper.data.verdict !== 'PASS') {
    p.log.error('Gatekeeper failed.');
    for (const reason of gatekeeper.data.reasons ?? []) {
      p.log.warn(`  - ${reason}`);
    }
    return;
  }

  const commitMessage = gatekeeper.data.commit_message || 'chore: commit manual changes';
  const decision = await confirmDiff(diff, commitMessage, { allowRetry: false });

  if (decision === 'commit') {
    await git.commitAll(commitMessage);
    p.log.success('Changes committed successfully.');
    return;
  }

  if (decision === 'amend') {
    await git.commitAmend(commitMessage);
    p.log.success('Previous commit amended successfully.');
    return;
  }

  p.log.warn('Changes were not committed.');
}

async function showProjectStatus(context: InteractiveContext): Promise<void> {
  const state = context.stateManager.load();
  const git = new GitOperations(context.cwd);

  let branch = 'unknown';
  let lastCommit = 'unknown';
  let worktree = 'unknown';

  try {
    branch = await git.getCurrentBranch();
    lastCommit = (await git.getLastCommitHash()).slice(0, 8) || 'none';
    worktree = (await git.isCleanWorktree()) ? 'clean' : 'dirty';
  } catch {
    worktree = 'not available';
  }

  p.log.info(chalk.cyan('Project Status'));
  p.log.message(`Session:      ${state.currentSessionId || 'none'}`);
  p.log.message(`Blueprint:    ${state.currentBlueprintId || 'none'}`);
  p.log.message(`Last Audit:   ${state.lastAuditTimestamp || 'never'}`);
  p.log.message(`Branch:       ${branch}`);
  p.log.message(`Last Commit:  ${lastCommit}`);
  p.log.message(`Worktree:     ${worktree}`);
  p.log.message(`Pending:      ${state.pendingMicrotasks.length} microtasks`);
  p.log.message(`Completed:    ${state.completedMicrotasks.length} microtasks`);

  if (state.pendingMicrotasks.length > 0) {
    p.log.message(`Pending IDs:  ${state.pendingMicrotasks.join(', ')}`);
  }

  if (state.completedMicrotasks.length > 0) {
    p.log.message(`Completed IDs:${state.completedMicrotasks.join(', ')}`);
  }

  console.log('');
}

async function runSelectedMicrotasks(
  context: InteractiveContext,
  session: ActiveMicrotaskSession,
): Promise<void> {
  if (session.microtasks.length === 0) {
    p.log.warn('No microtasks are available in this session.');
    return;
  }

  const selectedMicrotasks = await selectMicrotasks(session.microtasks);
  if (!selectedMicrotasks || selectedMicrotasks.length === 0) {
    p.log.info('No microtasks selected.');
    return;
  }

  for (const microtask of selectedMicrotasks) {
    p.log.info(chalk.bgCyan.black(' EXECUTE ') + chalk.cyan(` ${microtask.id}: ${microtask.title}`));

    const result = await executeWorkLoop({
      cwd: context.cwd,
      config: context.config,
      client: context.client,
      sessions: context.sessions,
      sessionId: session.sessionId,
      microtask,
      onGatekeeperApproved: confirmDiff,
    });

    if (result.success) {
      p.log.success(`Microtask completed. Commit: ${result.commitHash?.slice(0, 8)}`);
      const currentState = context.stateManager.load();
      context.stateManager.update({
        pendingMicrotasks: currentState.pendingMicrotasks.filter((id) => id !== microtask.id),
        completedMicrotasks: [...currentState.completedMicrotasks, microtask.id],
      });
      continue;
    }

    p.log.error(`Microtask failed: ${result.error}`);
    if (result.gatekeeperVerdict?.verdict === 'FAIL') {
      if (result.gatekeeperVerdict.reasons.length > 0) {
        for (const reason of result.gatekeeperVerdict.reasons) {
          p.log.warn(`  - ${reason}`);
        }
      }
      if (result.gatekeeperVerdict.required_changes.length > 0) {
        p.log.warn('  Required changes:');
        for (const change of result.gatekeeperVerdict.required_changes) {
          p.log.warn(`    - ${change}`);
        }
      }

      const git = new GitOperations(context.cwd);
      const diff = await git.getDiff();
      if (diff) {
        const fallbackMessage = result.gatekeeperVerdict.commit_message
          ?? `feat(${microtask.id}): ${microtask.title}`;
        const overrideDecision = await confirmGatekeeperOverride(diff, fallbackMessage);
        if (overrideDecision === 'commit') {
          const commitHash = await git.commitAll(fallbackMessage);
          p.log.success(`Committed despite gatekeeper failure: ${commitHash.slice(0, 8)}`);
          const currentState = context.stateManager.load();
          context.stateManager.update({
            pendingMicrotasks: currentState.pendingMicrotasks.filter((id) => id !== microtask.id),
            completedMicrotasks: [...currentState.completedMicrotasks, microtask.id],
          });
          continue;
        }
        if (overrideDecision === 'amend') {
          const commitHash = await git.commitAmend(fallbackMessage);
          p.log.success(`Amended despite gatekeeper failure: ${commitHash.slice(0, 8)}`);
          const currentState = context.stateManager.load();
          context.stateManager.update({
            pendingMicrotasks: currentState.pendingMicrotasks.filter((id) => id !== microtask.id),
            completedMicrotasks: [...currentState.completedMicrotasks, microtask.id],
          });
          continue;
        }
      }
    }
    const continueAnyway = await p.confirm({
      message: 'Continue to the next microtask?',
      initialValue: false,
    });

    if (p.isCancel(continueAnyway) || !continueAnyway) {
      break;
    }
  }
}
