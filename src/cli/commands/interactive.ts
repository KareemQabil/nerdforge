import type { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import chalk from 'chalk';
import { loadConfigStrict, resolveAuthToken } from '../../config/loader.js';
import { runInteractiveSetup } from '../interactive/setup.js';
import { introBanner, outroBanner, askGoal, selectMicrotasks, confirmDiff } from '../../ui/components.js';
import { generateRepoMap } from '../../repomap/generator.js';
import { RouterClient } from '../../router/client.js';
import { SessionManager } from '../../storage/session-manager.js';
import { StateManager } from '../../storage/state-manager.js';
import { ROUTER_TASKS, ARTIFACTS_DIR } from '../../types/constants.js';
import { BlueprintSchema, SymbolAuditSchema } from '../../types/schemas.js';
import type { Microtask } from '../../types/schemas.js';
import type { RepoMap } from '../../types/repomap.js';
import { executeWorkLoop } from '../../pipeline/work-loop.js';

export function registerInteractiveCommand(program: Command): void {
  // We register it as the default command if no args are passed
  program.action(async () => {
    introBanner();

    const cwd = process.cwd();
    await runInteractiveSetup(cwd);

    const config = loadConfigStrict(cwd);
    const token = resolveAuthToken(config);
    const stateManager = new StateManager(cwd);
    const sessions = new SessionManager(cwd);

    const goal = await askGoal();

    const client = new RouterClient({
      baseUrl: config.router.base_url,
      apiToken: token,
      timeoutMs: config.router.timeout_ms,
      maxRetries: config.workflow.max_router_retries,
      temperature: config.models.temperature,
      maxTokens: config.models.max_tokens.default,
    });

    const s = p.spinner();
    
    // 1. Repo Map
    s.start('Generating repository map...');
    const repoMap = await generateRepoMap(cwd, config);
    fs.writeFileSync(path.join(cwd, ARTIFACTS_DIR, 'repo-map.json'), JSON.stringify(repoMap, null, 2));
    s.message(`Repository map generated (${repoMap.total_files} files)`);

    // 2. Blueprint
    s.message('Designing architecture blueprint...');
    const content = `GOAL: ${goal}\n\nREPOSITORY MAP:\n${repoMap.files.map(f => `  ${f.path}`).join('\n')}`;
    const bpResult = await client.invokeTask(ROUTER_TASKS.ARCHITECTURE_BLUEPRINT, content, BlueprintSchema);
    
    const sessionId = sessions.createSession();
    sessions.saveArtifact(sessionId, 'blueprint.json', bpResult.data);
    s.message(`Blueprint crafted: ${bpResult.data.system_name}`);

    // 3. Normalize Microtasks
    const microtasks = bpResult.data.microtasks.map((mt, i) => ({
      id: mt.id || `MT-${String(i + 1).padStart(3, '0')}`,
      title: mt.title,
      description: mt.description ?? '',
      expected_files: mt.expected_files,
      tests: { new: mt.tests?.new ?? [], modified: mt.tests?.modified ?? [] },
      acceptance_criteria: mt.acceptance_criteria,
      tracing_proof_requirements: mt.tracing_proof_requirements,
    }));
    sessions.saveArtifact(sessionId, 'microtasks.json', microtasks);

    stateManager.update({
      currentBlueprintId: sessionId,
      currentSessionId: sessionId,
      pendingMicrotasks: microtasks.map(m => m.id),
      completedMicrotasks: [],
    });

    s.stop(`Blueprint complete. Found ${microtasks.length} microtasks.`);

    // 4. Symbol Audit
    s.start('Auditing symbols against repository...');
    const auditContent = `BLUEPRINT:\n${JSON.stringify(bpResult.data, null, 2)}\n\nREPO MAP:\n${repoMap.files.map((f: any) => f.path).join('\n')}`;
    const auditResult = await client.invokeTask(ROUTER_TASKS.SYMBOL_AUDIT, auditContent, SymbolAuditSchema);
    sessions.saveArtifact(sessionId, 'symbol-audit.json', auditResult.data);
    
    if (auditResult.data.verdict === 'PASS') {
      s.stop('Symbol audit passed (no hallucinations).');
    } else {
      s.stop('Symbol audit raised warnings.');
      p.log.warn(chalk.yellow('The blueprint mentions files/symbols that may not exist:'));
      auditResult.data.mismatches.forEach(m => p.log.warn(`  - ${m.name} in ${m.expected_location}`));
      
      const proceed = await p.confirm({ message: 'Proceed anyway?', initialValue: false });
      if (!proceed) process.exit(1);
    }

    // 5. Select Microtasks
    const selected = await selectMicrotasks(microtasks);
    if (selected.length === 0) {
      outroBanner('No microtasks selected. Done.');
      return;
    }

    // 6. Execute Work Loop
    for (const mt of selected) {
      p.log.info(chalk.bgCyan.black(`\n EXECUTE `) + chalk.cyan(` ${mt.id}: ${mt.title}`));
      
      const result = await executeWorkLoop({
        cwd,
        config,
        client,
        sessions,
        sessionId,
        microtask: mt,
        onGatekeeperApproved: confirmDiff,
      });

      if (result.success) {
        p.log.success(`Microtask completed. Commit: ${result.commitHash?.slice(0,8)}`);
        
        const state = stateManager.load();
        stateManager.update({
          pendingMicrotasks: state.pendingMicrotasks.filter(id => id !== mt.id),
          completedMicrotasks: [...state.completedMicrotasks, mt.id],
        });
      } else {
        p.log.error(`Microtask failed: ${result.error}`);
        const continueAnyway = await p.confirm({ message: 'Continue to next microtask?', initialValue: false });
        if (!continueAnyway) break;
      }
    }

    outroBanner('All selected tasks complete.');
  });
}
