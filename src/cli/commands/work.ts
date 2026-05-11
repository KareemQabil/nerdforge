import { loadContext, makeRouter } from './_shared.js';
import { GitOps } from '../../git/ops.js';
import { runWorkLoop } from '../../pipeline/work.js';
import { latestSession } from '../../storage/artifacts.js';
import { NerdforgeError } from '../../utils/errors.js';
import { log } from '../../utils/logger.js';

export interface WorkCliOptions {
  dryRun: boolean;
  sessionId?: string;
}

export async function cmdWork(
  cwd: string,
  microtaskId: string,
  opts: WorkCliOptions,
): Promise<void> {
  const ctx = await loadContext(cwd);
  const router = makeRouter(ctx);
  const git = new GitOps(cwd);

  const sessionDir = opts.sessionId
    ? ctx.paths.session(opts.sessionId)
    : await latestSession(ctx.paths.sessionsRoot());
  if (!sessionDir) {
    throw new NerdforgeError(
      'No session found. Run `nerdforge blueprint` first.',
      'WORK_NO_SESSION',
    );
  }

  log.info(`starting work loop for ${microtaskId}`);
  const result = await runWorkLoop(ctx.cfg, ctx.paths, router, git, {
    microtaskId,
    sessionDir,
    dryRun: opts.dryRun,
  });

  if (result.status === 'passed') {
    log.ok(`microtask ${microtaskId} PASSED in ${result.attempts} attempt(s)`);
  } else {
    log.err(`microtask ${microtaskId} FAILED after ${result.attempts} attempt(s)`);
    process.exitCode = 4;
  }
  log.out({ action: 'work', microtask_id: microtaskId, ...result });
}
