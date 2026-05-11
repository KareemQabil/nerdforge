#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { registerInitCommand } from './commands/init.js';
import { registerRepomapCommand } from './commands/repomap.js';
import { registerDoctorCommand } from './commands/doctor.js';
import { registerBlueprintCommand } from './commands/blueprint.js';
import { registerAuditSymbolsCommand } from './commands/audit-symbols.js';
import { registerMicrotasksCommand } from './commands/microtasks.js';
import { registerWorkCommand } from './commands/work.js';
import { registerGateCommand } from './commands/gate.js';
import { registerStatusCommand } from './commands/status.js';
import { registerInteractiveCommand } from './commands/interactive.js';

const program = new Command();

program
  .name('nerdforge')
  .description('Deterministic CLI orchestration for multi-agent software factory')
  .version('0.1.0');

registerInitCommand(program);
registerDoctorCommand(program);
registerRepomapCommand(program);
registerBlueprintCommand(program);
registerAuditSymbolsCommand(program);
registerMicrotasksCommand(program);
registerWorkCommand(program);
registerGateCommand(program);
registerStatusCommand(program);

// Register the default interactive command
registerInteractiveCommand(program);

program.parse();
