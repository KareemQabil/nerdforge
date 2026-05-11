import * as p from '@clack/prompts';
import chalk from 'chalk';
import type { Microtask } from '../types/schemas.js';
import { execSync } from 'node:child_process';

const CYAN = chalk.cyan;

export function introBanner(): void {
  console.clear();
  p.intro(chalk.bgCyan.black(' NERDFORGE V2 '));
  p.note('Deterministic Multi-Agent Software Factory\nPowered by DigitalOcean Inference', 'Welcome');
}

export function outroBanner(msg: string): void {
  p.outro(CYAN(`✓ ${msg}`));
}

export function cancelWithError(msg: string): never {
  p.cancel(chalk.red(msg));
  process.exit(1);
}

export async function askGoal(): Promise<string> {
  const goal = await p.text({
    message: CYAN('What would you like to build or refactor?'),
    placeholder: 'e.g. Implement the user authentication module',
    validate: (value) => {
      if (!value || value.trim().length === 0) return 'Goal cannot be empty';
    },
  });

  if (p.isCancel(goal)) {
    cancelWithError('Operation cancelled.');
  }

  return goal as string;
}

export async function selectMicrotasks(microtasks: Microtask[]): Promise<Microtask[]> {
  const selectedIds = await p.multiselect({
    message: CYAN('Select Microtasks to execute:'),
    options: microtasks.map(mt => ({
      value: mt.id,
      label: `${mt.id}: ${mt.title}`,
      hint: mt.expected_files.length > 0 ? `(${mt.expected_files.length} files)` : undefined
    })),
    required: true,
  });

  if (p.isCancel(selectedIds)) {
    cancelWithError('Operation cancelled.');
  }

  return microtasks.filter(mt => (selectedIds as string[]).includes(mt.id));
}

export async function confirmDiff(diff: string, commitMessage: string): Promise<'commit' | 'amend' | 'retry' | 'abort'> {
  // Display diff with simple coloring
  const lines = diff.split('\n');
  const coloredDiff = lines.map(line => {
    if (line.startsWith('+') && !line.startsWith('+++')) return chalk.green(line);
    if (line.startsWith('-') && !line.startsWith('---')) return chalk.red(line);
    if (line.startsWith('@@')) return chalk.gray(line);
    return line;
  }).join('\n');

  p.note(coloredDiff, 'Patch Preview');
  p.note(commitMessage, 'Suggested Commit');

  const action = await p.select({
    message: CYAN('Gatekeeper approved this patch. How to proceed?'),
    options: [
      { value: 'commit', label: 'Approve & Commit' },
      { value: 'amend', label: 'Approve & Amend Previous Commit' },
      { value: 'retry', label: 'Reject & Request Another Attempt' },
      { value: 'abort', label: 'Abort' },
    ]
  });

  if (p.isCancel(action)) {
    return 'abort';
  }

  return action as 'commit' | 'amend' | 'retry' | 'abort';
}
