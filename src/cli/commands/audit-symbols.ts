import type { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, loadConfigStrict, resolveAuthToken } from '../../config/loader.js';
import { RouterClient } from '../../router/client.js';
import { SessionManager } from '../../storage/session-manager.js';
import { StateManager } from '../../storage/state-manager.js';
import { ROUTER_TASKS, ARTIFACTS_DIR } from '../../types/constants.js';
import { SymbolAuditSchema } from '../../types/schemas.js';
import type { Blueprint } from '../../types/schemas.js';
import type { RepoMap } from '../../types/repomap.js';

export function registerAuditSymbolsCommand(program: Command): void {
  program
    .command('audit:symbols')
    .description('Audit blueprint symbols against repository')
    .action(async () => {
      const cwd = process.cwd();
      const config = loadConfigStrict(cwd);
      const token = resolveAuthToken(config);

      const stateManager = new StateManager(cwd);
      const state = stateManager.load();
      const sessions = new SessionManager(cwd);

      if (!state.currentSessionId) {
        console.error('✗ No active session. Run "nerdforge blueprint" first.');
        process.exitCode = 1;
        return;
      }

      // Load blueprint and repo map
      const blueprint = sessions.loadArtifact<Blueprint>(state.currentSessionId, 'blueprint.json');
      if (!blueprint) {
        console.error('✗ No blueprint found in current session.');
        process.exitCode = 1;
        return;
      }

      const repoMapPath = path.join(cwd, ARTIFACTS_DIR, 'repo-map.json');
      if (!fs.existsSync(repoMapPath)) {
        console.error('✗ No repo map found. Run "nerdforge repomap" first.');
        process.exitCode = 1;
        return;
      }
      const repoMap: RepoMap = JSON.parse(fs.readFileSync(repoMapPath, 'utf-8'));

      const content = [
        'BLUEPRINT:',
        JSON.stringify(blueprint, null, 2),
        '',
        'REPOSITORY FILES:',
        repoMap.files.map((f) => f.path).join('\n'),
      ].join('\n');

      const client = new RouterClient({
        baseUrl: config.router.base_url,
        apiToken: token,
        timeoutMs: config.router.timeout_ms,
        maxRetries: config.workflow.max_router_retries,
        temperature: config.models.temperature,
        maxTokens: config.models.max_tokens.default,
      });

      console.log('⏳ Running symbol existence audit...');

      const result = await client.invokeTask(
        ROUTER_TASKS.SYMBOL_AUDIT,
        content,
        SymbolAuditSchema,
        { schemaId: 'nerdforge.symbolaudit.v1' },
      );

      sessions.saveArtifact(state.currentSessionId, 'symbol-audit.json', result.data);
      stateManager.update({ lastAuditTimestamp: new Date().toISOString() });

      if (result.data.verdict === 'PASS') {
        console.log('✓ Symbol audit PASSED');
      } else {
        console.error('✗ Symbol audit FAILED');
        for (const m of result.data.mismatches) {
          console.error(`  - ${m.kind}: ${m.name} (expected: ${m.expected_location}, found: ${m.found})`);
          if (m.notes) console.error(`    ${m.notes}`);
        }
        console.error('\nRegenerate blueprint or update repo map to fix mismatches.');
        process.exitCode = 1;
      }
    });
}
