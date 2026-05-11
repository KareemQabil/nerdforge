import Table from 'cli-table3';
import { loadContext } from './_shared.js';
import { GitOps } from '../../git/ops.js';
import { readState } from '../../storage/state.js';
import { log } from '../../utils/logger.js';

export async function cmdStatus(cwd: string): Promise<void> {
  const ctx = await loadContext(cwd);
  const state = await readState(ctx.paths.state());
  const git = new GitOps(cwd);
  const branch = (await git.isRepo()) ? await git.currentBranch() : '(not a git repo)';
  const clean = (await git.isRepo()) ? await git.isClean() : false;

  const tasks = Object.entries(state.microtasks);
  const table = new Table({ head: ['Microtask', 'Status', 'Attempts', 'Commit', 'Updated'] });
  for (const [id, m] of tasks) {
    table.push([
      id,
      m.status,
      String(m.lastAttempt),
      m.lastCommitSha ? m.lastCommitSha.slice(0, 8) : '-',
      m.lastUpdated,
    ]);
  }

  process.stderr.write(`Current branch: ${branch}${clean ? ' (clean)' : ' (dirty)'}\n`);
  process.stderr.write(`Current session: ${state.currentSessionId ?? '(none)'}\n`);
  process.stderr.write(`Last blueprint: ${state.lastBlueprintPath ?? '(none)'}\n`);
  process.stderr.write(`Last symbol audit: ${state.lastSymbolAuditPath ?? '(none)'}\n`);
  if (tasks.length) process.stderr.write(table.toString() + '\n');
  else process.stderr.write('(no microtasks tracked yet)\n');

  log.out({
    action: 'status',
    branch,
    clean,
    currentSessionId: state.currentSessionId,
    lastBlueprintPath: state.lastBlueprintPath,
    lastSymbolAuditPath: state.lastSymbolAuditPath,
    microtasks: state.microtasks,
  });
}
