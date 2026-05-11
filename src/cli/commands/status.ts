import type { Command } from 'commander';
import { loadConfig } from '../../config/loader.js';
import { StateManager } from '../../storage/state-manager.js';
import { GitOperations } from '../../git/operations.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show nerdforge workflow status')
    .action(async () => {
      const cwd = process.cwd();

      try {
        loadConfig(cwd);
      } catch {
        console.error('✗ Not a nerdforge project. Run "nerdforge init" first.');
        process.exitCode = 1;
        return;
      }

      const state = new StateManager(cwd).load();
      const git = new GitOperations(cwd);

      let branch = 'unknown';
      let lastCommit = 'unknown';
      try {
        branch = await git.getCurrentBranch();
        lastCommit = (await git.getLastCommitHash()).slice(0, 8) || 'none';
      } catch { /* not a git repo */ }

      console.log('nerdforge status');
      console.log('─────────────────────────');
      console.log(`Session:      ${state.currentSessionId || 'none'}`);
      console.log(`Blueprint:    ${state.currentBlueprintId || 'none'}`);
      console.log(`Last Audit:   ${state.lastAuditTimestamp || 'never'}`);
      console.log(`Branch:       ${branch}`);
      console.log(`Last Commit:  ${lastCommit}`);
      console.log(`Pending:      ${state.pendingMicrotasks.length} microtasks`);
      console.log(`Completed:    ${state.completedMicrotasks.length} microtasks`);

      if (state.pendingMicrotasks.length > 0) {
        console.log('\nPending microtasks:');
        for (const id of state.pendingMicrotasks) {
          console.log(`  [ ] ${id}`);
        }
      }
      if (state.completedMicrotasks.length > 0) {
        console.log('\nCompleted microtasks:');
        for (const id of state.completedMicrotasks) {
          console.log(`  [x] ${id}`);
        }
      }
    });
}
