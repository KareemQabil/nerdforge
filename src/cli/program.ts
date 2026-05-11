import { Command } from 'commander';
import { cmdInit } from './commands/init.js';
import { cmdDoctor } from './commands/doctor.js';
import { cmdRepoMap } from './commands/repomap.js';
import { cmdBlueprint } from './commands/blueprint.js';
import { cmdAuditSymbols } from './commands/auditSymbols.js';
import { cmdMicrotasks } from './commands/microtasks.js';
import { cmdWork } from './commands/work.js';
import { cmdGate } from './commands/gate.js';
import { cmdStatus } from './commands/status.js';
import { log } from '../utils/logger.js';
import { isNerdforgeError } from '../utils/errors.js';

const VERSION = '0.1.0';

export function buildProgram(): Command {
  const program = new Command();
  program
    .name('nerdforge')
    .description(
      'Deterministic CLI orchestrator for the DigitalOcean Inference Router `nerdpos`.\n' +
        'Drives an Autonomous Multi-Agent Software Factory: TDD loops, schema-validated\n' +
        'agent outputs, tracing proofs, and atomic baby-step commits.',
    )
    .version(VERSION);

  // ----- init -----
  program
    .command('init')
    .description('Create nerdforge.yaml and `.nerdforge/` artifacts directory')
    .action(wrap((opts, _cmd) => cmdInit(cwdOf(opts))));

  // ----- doctor -----
  program
    .command('doctor')
    .description('Validate environment, config, token, and git readiness')
    .action(wrap((opts) => cmdDoctor(cwdOf(opts))));

  // ----- repomap -----
  program
    .command('repomap')
    .description('Generate `.nerdforge/repo-map.json` from the include/exclude config')
    .action(wrap((opts) => cmdRepoMap(cwdOf(opts))));

  // ----- blueprint -----
  program
    .command('blueprint')
    .description('Request an architecture blueprint from the router')
    .requiredOption('-g, --goal <goal>', 'High-level engineering goal')
    .option('-c, --context <context>', 'Additional context for the architect', '')
    .action(
      wrap((opts) =>
        cmdBlueprint(cwdOf(opts), { goal: opts.goal, context: opts.context || undefined }),
      ),
    );

  // ----- audit:symbols -----
  program
    .command('audit:symbols')
    .description('Run the repository symbol existence audit against the latest blueprint')
    .action(wrap((opts) => cmdAuditSymbols(cwdOf(opts))));

  // ----- microtasks -----
  program
    .command('microtasks')
    .description('Normalise the blueprint microtasks into `microtasks.json`')
    .action(wrap((opts) => cmdMicrotasks(cwdOf(opts))));

  // ----- work -----
  program
    .command('work <microtaskId>')
    .description('Run the TDD loop (worker → patch → tests → hygiene → gatekeeper → commit)')
    .option('--dry-run', 'Stop before the router call (writes request artifact only)', false)
    .option('--session <id>', 'Target a specific session id under `.nerdforge/sessions/`')
    .action(
      wrap((id: string, opts) =>
        cmdWork(cwdOf(opts), id, { dryRun: !!opts.dryRun, sessionId: opts.session }),
      ),
    );

  // ----- gate -----
  program
    .command('gate <microtaskId>')
    .description('Run hygiene + gatekeeper on the currently staged diff')
    .action(wrap((id: string, opts) => cmdGate(cwdOf(opts), id)));

  // ----- status -----
  program
    .command('status')
    .description('Summarise blueprint, microtasks, branch, and last run results')
    .action(wrap((opts) => cmdStatus(cwdOf(opts))));

  // Global flag: --cwd
  program.option('--cwd <path>', 'Run as if invoked from <path>');

  return program;
}

function cwdOf(opts: { cwd?: string } & Record<string, unknown>): string {
  // commander forwards parent options on the command-action `opts` arg only
  // when configured; we fetch from parent explicitly for safety.
  if (typeof opts.cwd === 'string' && opts.cwd) return opts.cwd;
  const parent = (opts as { parent?: { opts: () => { cwd?: string } } }).parent;
  const parentCwd = parent?.opts?.().cwd;
  return parentCwd ?? process.cwd();
}

type AnyAsyncFn = (...args: any[]) => Promise<void>;

function wrap<F extends AnyAsyncFn>(fn: F): (...args: Parameters<F>) => Promise<void> {
  return async (...args: Parameters<F>) => {
    try {
      await fn(...args);
    } catch (e) {
      if (isNerdforgeError(e)) {
        log.err(`${e.code}: ${e.message}`);
      } else {
        log.err((e as Error).message || String(e));
      }
      process.exitCode = process.exitCode || 1;
    }
  };
}
