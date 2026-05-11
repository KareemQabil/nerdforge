import type { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfigStrict, resolveAuthToken } from '../../config/loader.js';
import { runSymbolAudit } from '../../audit/symbol-audit.js';
import { RouterClient } from '../../router/client.js';
import { SessionManager } from '../../storage/session-manager.js';
import { StateManager } from '../../storage/state-manager.js';
import { ARTIFACTS_DIR } from '../../types/constants.js';
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
        console.error('No active session. Run "nerdforge blueprint" first.');
        process.exitCode = 1;
        return;
      }

      const blueprint = sessions.loadArtifact<Blueprint>(state.currentSessionId, 'blueprint.json');
      if (!blueprint) {
        console.error('No blueprint found in the current session.');
        process.exitCode = 1;
        return;
      }

      const repoMapPath = path.join(cwd, ARTIFACTS_DIR, 'repo-map.json');
      if (!fs.existsSync(repoMapPath)) {
        console.error('No repo map found. Run "nerdforge repomap" first.');
        process.exitCode = 1;
        return;
      }

      const repoMap: RepoMap = JSON.parse(fs.readFileSync(repoMapPath, 'utf-8'));
      const client = new RouterClient({
        baseUrl: config.router.base_url,
        apiToken: token,
        timeoutMs: config.router.timeout_ms,
        maxRetries: config.workflow.max_router_retries,
        temperature: config.models.temperature,
        maxTokens: config.models.max_tokens.default,
      });

      console.log('Running symbol existence audit...');

      const result = await runSymbolAudit({
        blueprint,
        client,
        repoMap,
      });

      sessions.saveArtifact(state.currentSessionId, 'symbol-audit.json', result.audit);
      if (result.diagnostics) {
        sessions.saveArtifact(state.currentSessionId, 'symbol-audit-diagnostics.json', {
          ...result.diagnostics,
          effectiveVerdict: result.effectiveVerdict,
          mode: result.mode,
        });
      }
      stateManager.update({ lastAuditTimestamp: new Date().toISOString() });

      if (result.mode === 'fallback') {
        console.warn('Router symbol audit failed. Used local deterministic fallback audit.');
      }

      if (result.analysis.advisory.length > 0) {
        console.log('Advisory symbol audit items:');
        for (const mismatch of result.analysis.advisory) {
          console.log(`  - ${mismatch.kind}: ${mismatch.name} (${mismatch.expected_location})`);
        }
      }

      if (result.effectiveVerdict === 'PASS') {
        console.log('Symbol audit passed.');
        return;
      }

      console.error('Symbol audit failed.');
      for (const mismatch of result.analysis.blocking) {
        console.error(
          `  - ${mismatch.kind}: ${mismatch.name} ` +
          `(expected: ${mismatch.expected_location}, found: ${mismatch.found})`,
        );
        if (mismatch.notes) {
          console.error(`    ${mismatch.notes}`);
        }
      }
      process.exitCode = 1;
    });
}
