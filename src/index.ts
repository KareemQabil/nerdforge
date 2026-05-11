#!/usr/bin/env node
import { buildProgram } from './cli/program.js';

const program = buildProgram();
program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`nerdforge: fatal: ${msg}\n`);
  process.exit(1);
});
