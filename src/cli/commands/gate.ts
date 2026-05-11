import type { Command } from 'commander';
import { loadConfig, loadConfigStrict, resolveAuthToken } from '../../config/loader.js';
import { RouterClient } from '../../router/client.js';
import { GitOperations } from '../../git/operations.js';
import { ROUTER_TASKS } from '../../types/constants.js';
import { HygieneSchema, GatekeeperSchema } from '../../types/schemas.js';

export function registerGateCommand(program: Command): void {
  program
    .command('gate <microtaskId>')
    .description('Run hygiene + gatekeeper on current changes')
    .action(async (microtaskId: string) => {
      const cwd = process.cwd();
      const config = loadConfigStrict(cwd);
      const token = resolveAuthToken(config);
      const git = new GitOperations(cwd);

      const diff = await git.getDiff();
      if (!diff) {
        console.log('No uncommitted changes to gate.');
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

      // Hygiene
      console.log('⏳ Running hygiene audit...');
      const hygiene = await client.invokeTask(
        ROUTER_TASKS.HYGIENE_AUDIT,
        `DIFF:\n${diff}`,
        HygieneSchema,
      );
      console.log(`  Hygiene: ${hygiene.data.verdict} (${hygiene.data.findings.length} findings)`);

      // Gatekeeper
      console.log('⏳ Running gatekeeper...');
      const gatekeeper = await client.invokeTask(
        ROUTER_TASKS.TDD_GATEKEEPER,
        `MICROTASK_ID: ${microtaskId}\nDIFF:\n${diff}\nHYGIENE: ${hygiene.data.verdict}`,
        GatekeeperSchema,
      );

      if (gatekeeper.data.verdict === 'PASS') {
        console.log(`✓ PASS — Suggested commit: ${gatekeeper.data.commit_message}`);
      } else {
        console.error('✗ FAIL');
        for (const r of gatekeeper.data.reasons) console.error(`  - ${r}`);
        process.exitCode = 1;
      }
    });
}
