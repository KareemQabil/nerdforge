import type { Command } from 'commander';
import { loadConfig } from '../../config/loader.js';
import { SessionManager } from '../../storage/session-manager.js';
import { StateManager } from '../../storage/state-manager.js';
import type { Blueprint, Microtask } from '../../types/schemas.js';

export function registerMicrotasksCommand(program: Command): void {
  program
    .command('microtasks')
    .description('Normalize blueprint into microtasks.json')
    .action(async () => {
      const cwd = process.cwd();
      loadConfig(cwd); // validate config exists

      const stateManager = new StateManager(cwd);
      const state = stateManager.load();
      const sessions = new SessionManager(cwd);

      if (!state.currentSessionId) {
        console.error('✗ No active session. Run "nerdforge blueprint" first.');
        process.exitCode = 1;
        return;
      }

      const blueprint = sessions.loadArtifact<Blueprint>(state.currentSessionId, 'blueprint.json');
      if (!blueprint) {
        console.error('✗ No blueprint found.');
        process.exitCode = 1;
        return;
      }

      // Normalize microtasks — ensure all required fields
      const microtasks: Microtask[] = blueprint.microtasks.map((mt, i) => ({
        id: mt.id || `MT-${String(i + 1).padStart(3, '0')}`,
        title: mt.title,
        description: mt.description ?? '',
        expected_files: mt.expected_files,
        tests: {
          new: mt.tests?.new ?? [],
          modified: mt.tests?.modified ?? [],
        },
        acceptance_criteria: mt.acceptance_criteria,
        tracing_proof_requirements: mt.tracing_proof_requirements,
      }));

      const savedPath = sessions.saveArtifact(
        state.currentSessionId,
        'microtasks.json',
        microtasks,
      );

      stateManager.update({
        pendingMicrotasks: microtasks.map((mt) => mt.id),
      });

      console.log(`✓ Normalized ${microtasks.length} microtasks`);
      for (const mt of microtasks) {
        console.log(`  ${mt.id}: ${mt.title}`);
      }
      console.log(`  Saved: ${savedPath}`);
    });
}
