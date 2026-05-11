import type { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfigStrict, resolveAuthToken } from '../../config/loader.js';
import { RouterClient } from '../../router/client.js';
import { SessionManager } from '../../storage/session-manager.js';
import { StateManager } from '../../storage/state-manager.js';
import { ROUTER_TASKS, ARTIFACTS_DIR } from '../../types/constants.js';
import { BlueprintSchema } from '../../types/schemas.js';
import type { Microtask } from '../../types/schemas.js';
import type { RepoMap } from '../../types/repomap.js';

export function registerBlueprintCommand(program: Command): void {
  program
    .command('blueprint')
    .description('Generate architecture blueprint from goal')
    .requiredOption('--goal <text>', 'Architecture goal description')
    .option('--context <text>', 'Additional context')
    .action(async (opts: { goal: string; context?: string }) => {
      const cwd = process.cwd();
      const config = loadConfigStrict(cwd);
      const token = resolveAuthToken(config);

      const repoMapPath = path.join(cwd, ARTIFACTS_DIR, 'repo-map.json');
      if (!fs.existsSync(repoMapPath)) {
        console.error('No repo map found. Run "nerdforge repomap" first.');
        process.exitCode = 1;
        return;
      }

      const repoMap: RepoMap = JSON.parse(fs.readFileSync(repoMapPath, 'utf-8'));
      const repoSummary = repoMap.files
        .map((file) => `  ${file.path} (${file.size_bytes}b)`)
        .join('\n');

      const content = [
        `GOAL: ${opts.goal}`,
        opts.context ? `CONTEXT: ${opts.context}` : '',
        '',
        `REPOSITORY MAP (${repoMap.total_files} files):`,
        repoSummary,
      ]
        .filter(Boolean)
        .join('\n');

      const client = new RouterClient({
        baseUrl: config.router.base_url,
        apiToken: token,
        timeoutMs: config.router.timeout_ms,
        maxRetries: config.workflow.max_router_retries,
        temperature: config.models.temperature,
        maxTokens: config.models.max_tokens.default,
      });

      console.log('Requesting architecture blueprint...');

      const result = await client.invokeTask(
        ROUTER_TASKS.ARCHITECTURE_BLUEPRINT,
        content,
        BlueprintSchema,
        { schemaId: 'nerdforge.blueprint.v1' },
      );

      const sessions = new SessionManager(cwd);
      const sessionId = sessions.createSession();
      const savedPath = sessions.saveArtifact(sessionId, 'blueprint.json', result.data);
      const microtasks: Microtask[] = (result.data.microtasks ?? []).map((mt, index) => ({
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
      sessions.saveArtifact(sessionId, 'microtasks.json', microtasks);

      const state = new StateManager(cwd);
      const domainModules = result.data.domain_modules ?? [];
      state.update({
        currentBlueprintId: sessionId,
        currentSessionId: sessionId,
        pendingMicrotasks: microtasks.map((mt) => mt.id),
        completedMicrotasks: [],
      });

      console.log(`Blueprint created: ${result.data.system_name}`);
      console.log(`  Modules: ${domainModules.length}`);
      console.log(`  Microtasks: ${microtasks.length}`);
      console.log(`  Routed to: ${result.routedTo}`);
      console.log(`  Saved: ${savedPath}`);
    });
}
