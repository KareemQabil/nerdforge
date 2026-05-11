import chalk from 'chalk';

/**
 * Minimal structured logger. Diagnostic output goes to stderr; the `out` channel
 * writes machine-readable JSON to stdout so `nerdforge ... | jq` works.
 */
export const log = {
  info(msg: string): void {
    process.stderr.write(`${chalk.cyan('•')} ${msg}\n`);
  },
  ok(msg: string): void {
    process.stderr.write(`${chalk.green('✔')} ${msg}\n`);
  },
  warn(msg: string): void {
    process.stderr.write(`${chalk.yellow('⚠')} ${msg}\n`);
  },
  err(msg: string): void {
    process.stderr.write(`${chalk.red('✖')} ${msg}\n`);
  },
  dim(msg: string): void {
    process.stderr.write(`${chalk.dim(msg)}\n`);
  },
  step(n: number, total: number, msg: string): void {
    process.stderr.write(`${chalk.dim(`[${n}/${total}]`)} ${msg}\n`);
  },
  out(obj: unknown): void {
    process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
  },
  raw(msg: string): void {
    process.stderr.write(msg);
  },
};
