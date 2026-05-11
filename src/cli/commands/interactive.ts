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
  program.action(async () => {
    introBanner();

    const cwd = process.cwd();
    await runInteractiveSetup(cwd);

    const config = loadConfigStrict(cwd);
    const token = resolveAuthToken(config);
    const stateManager = new StateManager(cwd);
    const sessions = new SessionManager(cwd);
    const client = new RouterClient({
      baseUrl: config.router.base_url,
      apiToken: token,
      timeoutMs: config.router.timeout_ms,
      maxRetries: config.workflow.max_router_retries,
      temperature: config.models.temperature,
      maxTokens: config.models.max_tokens.default,
    });

    while (true) {
      const state = stateManager.load();
      const hasPending = state.pendingMicrotasks.length > 0;

      const action = await p.select({
        message: chalk.cyan('Main Menu - What would you like to do?'),
        options: [
          { value: 'new_blueprint', label: '🏗️  New Architecture Blueprint' },
          ...(hasPending ? [{ value: 'resume', label: '🚀 Resume Pending Microtasks' }] : []),
          { value: 'gatekeeper', label: '🛡️  Audit Uncommitted Changes (Gatekeeper)' },
          { value: 'status', label: '📊 View Project Status' },
          { value: 'exit', label: '❌ Exit' },
        ],
      });

      if (p.isCancel(action) || action === 'exit') {
        outroBanner('Goodbye!');
        process.exit(0);
      }

      if (action === 'status') {
        const { execSync } = await import('node:child_process');
        p.log.info(chalk.cyan('--- Project Status ---'));
        p.log.message(`Session:    ${state.currentSessionId || 'None'}`);
        p.log.message(`Blueprint:  ${state.currentBlueprintId || 'None'}`);
        p.log.message(`Pending:    ${state.pendingMicrotasks.length} microtasks`);
        p.log.message(`Completed:  ${state.completedMicrotasks.length} microtasks`);
        try {
          const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', stdio: 'pipe' }).trim();
          p.log.message(`Branch:     ${branch}`);
        } catch { /* ignore */ }
        console.log('');
        continue;
      }

      if (action === 'gatekeeper') {
        const { GitOperations } = await import('../../git/operations.js');
        const git = new GitOperations(cwd);
        const diff = await git.getDiff();
        
        if (!diff) {
          p.log.warn('No uncommitted changes to audit.');
          continue;
        }

        const s = p.spinner();
        s.start('Running Hygiene Audit...');
        const hygiene = await client.invokeTask(
          ROUTER_TASKS.HYGIENE_AUDIT,
          `DIFF:\n${diff}`,
          SymbolAuditSchema as any, // Temp cast, schema is hygiene actually
          { schemaId: 'nerdforge.hygiene.v1' }
        );
        s.message(`Hygiene complete: ${(hygiene.data as any).verdict}`);
        
        s.message('Running Gatekeeper...');
        const gatekeeper = await client.invokeTask(
          ROUTER_TASKS.TDD_GATEKEEPER,
          `DIFF:\n${diff}\nHYGIENE: ${(hygiene.data as any).verdict}`,
          SymbolAuditSchema as any,
          { schemaId: 'nerdforge.gatekeeper.v1' }
        );
        s.stop('Gatekeeper complete.');

        const gData = gatekeeper.data as any;
        if (gData.verdict === 'PASS') {
          const commitDecision = await confirmDiff(diff, gData.commit_message || 'manual changes');
          if (commitDecision === 'commit') {
            await git.commitAll(gData.commit_message || 'manual changes');
            p.log.success('Changes committed successfully.');
          } else if (commitDecision === 'amend') {
            await git.commitAmend(gData.commit_message || 'manual changes');
            p.log.success('Previous commit amended successfully.');
          } else {
            p.log.warn('Changes not committed.');
          }
        } else {
          p.log.error('Gatekeeper FAILED.');
          gData.reasons?.forEach((r: string) => p.log.warn(` - ${r}`));
        }
        continue;
      }

      let microtasks: Microtask[] = [];
      let sessionId = state.currentSessionId;

      if (action === 'new_blueprint') {
        const goal = await askGoal();
        const s = p.spinner();
        
        s.start('Generating repository map...');
        const repoMap = await generateRepoMap(cwd, config);
        fs.writeFileSync(path.join(cwd, ARTIFACTS_DIR, 'repo-map.json'), JSON.stringify(repoMap, null, 2));
        
        s.message('Designing architecture blueprint...');
        const content = `GOAL: ${goal}\n\nREPOSITORY MAP:\n${repoMap.files.map(f => `  ${f.path}`).join('\n')}`;
        const bpResult = await client.invokeTask(ROUTER_TASKS.ARCHITECTURE_BLUEPRINT, content, BlueprintSchema);
        
        sessionId = sessions.createSession();
        sessions.saveArtifact(sessionId, 'blueprint.json', bpResult.data);
        
        microtasks = bpResult.data.microtasks.map((mt, i) => ({
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

        const auditContent = `BLUEPRINT:\n${JSON.stringify(bpResult.data, null, 2)}\n\nREPO MAP:\n${repoMap.files.map((f: any) => f.path).join('\n')}`;
        const auditResult = await client.invokeTask(ROUTER_TASKS.SYMBOL_AUDIT, auditContent, SymbolAuditSchema);
        sessions.saveArtifact(sessionId, 'symbol-audit.json', auditResult.data);
        
        if (auditResult.data.verdict !== 'PASS') {
          p.log.warn(chalk.yellow('The blueprint mentions files/symbols that may not exist:'));
          auditResult.data.mismatches.forEach(m => p.log.warn(`  - ${m.name} in ${m.expected_location}`));
          const proceed = await p.confirm({ message: 'Proceed anyway?', initialValue: false });
          if (!proceed) continue;
        } else {
          p.log.success('Symbol audit passed.');
        }
      }

      if (action === 'resume') {
        const loaded = sessions.loadArtifact<Microtask[]>(sessionId, 'microtasks.json');
        if (!loaded) {
          p.log.error('Could not load microtasks for current session.');
          continue;
        }
        microtasks = loaded.filter(m => state.pendingMicrotasks.includes(m.id));
      }

      if (microtasks.length > 0) {
        const selected = await selectMicrotasks(microtasks);
        if (selected.length === 0) {
          p.log.info('No tasks selected.');
          continue;
        }

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
            const currentState = stateManager.load();
            stateManager.update({
              pendingMicrotasks: currentState.pendingMicrotasks.filter(id => id !== mt.id),
              completedMicrotasks: [...currentState.completedMicrotasks, mt.id],
            });
          } else {
            p.log.error(`Microtask failed: ${result.error}`);
            const continueAnyway = await p.confirm({ message: 'Continue to next microtask?', initialValue: false });
            if (!continueAnyway) break;
          }
        }
      }
    }
  });
}
