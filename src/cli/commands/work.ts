import type { Command } from 'commander';
import { loadConfig, loadConfigStrict, resolveAuthToken } from '../../config/loader.js';
import { RouterClient } from '../../router/client.js';
import { SessionManager } from '../../storage/session-manager.js';
import { StateManager } from '../../storage/state-manager.js';
import { executeWorkLoop } from '../../pipeline/work-loop.js';
import { GitOperations } from '../../git/operations.js';
import type { Microtask } from '../../types/schemas.js';

export function registerWorkCommand(program: Command): void {
  program
    .command('work <microtaskId>')
    .description('Run TDD work loop for a microtask')
    .option('--attempt <n>', 'Start attempt number', '1')
    .option('--dry-run', 'Show patch without applying')
    .option('--override-gatekeeper', 'Commit even if gatekeeper fails')
    .action(async (
      microtaskId: string,
      opts: { attempt: string; dryRun?: boolean; overrideGatekeeper?: boolean },
    ) => {
      const cwd = process.cwd();
      const config = loadConfigStrict(cwd);
      const token = resolveAuthToken(config);
      const overrideGatekeeper = Boolean(opts.overrideGatekeeper);

      const stateManager = new StateManager(cwd);
      const state = stateManager.load();
      const sessions = new SessionManager(cwd);

      if (!state.currentSessionId) {
        console.error('✗ No active session. Run "nerdforge blueprint" first.');
        process.exitCode = 1;
        return;
      }

      // Load microtasks
      const microtasks = sessions.loadArtifact<Microtask[]>(state.currentSessionId, 'microtasks.json');
      if (!microtasks) {
        console.error('✗ No microtasks found. Run "nerdforge microtasks" first.');
        process.exitCode = 1;
        return;
      }

      const microtask = microtasks.find((mt) => mt.id === microtaskId);
      if (!microtask) {
        console.error(`✗ Microtask "${microtaskId}" not found. Available:`);
        for (const mt of microtasks) {
          console.error(`  ${mt.id}: ${mt.title}`);
        }
        process.exitCode = 1;
        return;
      }

      const client = new RouterClient({
        baseUrl: config.router.base_url,
        apiToken: token,
        timeoutMs: config.router.timeout_ms,
        maxRetries: config.workflow.max_router_retries,
        temperature: config.models.temperature,
        maxTokens: config.models.max_tokens.default,
      });

      console.log(`🔧 Working on: ${microtask.id} — ${microtask.title}`);

      const result = await executeWorkLoop({
        cwd,
        config,
        client,
        sessions,
        sessionId: state.currentSessionId,
        microtask,
        dryRun: opts.dryRun,
      });

      if (result.success) {
        console.log('\n✓ Microtask completed successfully');
        if (result.commitHash) console.log(`  Commit: ${result.commitHash}`);
        if (result.proofPath) console.log(`  Proof: ${result.proofPath}`);

        // Update state
        const pending = state.pendingMicrotasks.filter((id) => id !== microtaskId);
        const completed = [...state.completedMicrotasks, microtaskId];
        stateManager.update({ pendingMicrotasks: pending, completedMicrotasks: completed });
      } else {
        console.error(`\n✗ Microtask failed: ${result.error}`);
        if (overrideGatekeeper && result.gatekeeperVerdict?.verdict === 'FAIL') {
          const git = new GitOperations(cwd);
          const commitMessage = result.gatekeeperVerdict.commit_message
            ?? `feat(${microtask.id}): ${microtask.title}`;
          try {
            const commitHash = await git.commitAll(commitMessage);
            console.warn('⚠ Gatekeeper failed; committed anyway due to override flag.');
            console.log(`  Commit: ${commitHash}`);

            const pending = state.pendingMicrotasks.filter((id) => id !== microtaskId);
            const completed = [...state.completedMicrotasks, microtaskId];
            stateManager.update({ pendingMicrotasks: pending, completedMicrotasks: completed });
            return;
          } catch (commitError) {
            const message = commitError instanceof Error ? commitError.message : String(commitError);
            console.error(`Failed to commit after gatekeeper failure: ${message}`);
            process.exitCode = 1;
            return;
          }
        }
        process.exitCode = 1;
      }
    });
}
