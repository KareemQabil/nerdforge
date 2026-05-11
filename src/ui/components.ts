import * as p from '@clack/prompts';
import chalk from 'chalk';
import type { Microtask } from '../types/schemas.js';

const CYAN = chalk.cyan;

export type MainMenuAction =
  | 'new_blueprint'
  | 'resume_microtasks'
  | 'gatekeeper'
  | 'status'
  | 'exit';

export function introBanner(): void {
  console.clear();
  const splash = [
    ' _   _ _____ ____  ____  _____ ___  ____   ____ _____ ',
    '| \\ | | ____|  _ \\|  _ \\|  ___/ _ \\|  _ \\ / ___| ____|',
    "|  \\| |  _| | |_) | | | | |_ | | | | |_) | |  _|  _|  ",
    '| |\\  | |___|  _ <| |_| |  _|| |_| |  _ <| |_| | |___ ',
    '|_| \\_|_____|_| \\_\\____/|_|   \\___/|_| \\_\\\\____|_____|',
  ].join('\n');

  p.intro(chalk.bgCyan.black(' NERDFORGE V2 '));
  p.note(
    [
      chalk.cyanBright(splash),
      '',
      chalk.bold('Blueprint. Audit. Ship.'),
      'Deterministic multi-agent software factory for real repositories.',
      'Start a new architecture blueprint, resume pending microtasks, or audit manual changes.',
    ].join('\n'),
    'Hero',
  );
}

export function outroBanner(msg: string): void {
  p.outro(CYAN(`Done: ${msg}`));
}

export function cancelWithError(msg: string): never {
  p.cancel(chalk.red(msg));
  process.exit(1);
}

export function buildMainMenuOptions(hasPendingTasks: boolean): Array<{
  value: MainMenuAction;
  label: string;
  hint?: string;
}> {
  return [
    {
      value: 'new_blueprint',
      label: 'New Architecture Blueprint',
      hint: 'Goal -> blueprint -> audit -> work loop',
    },
    ...(hasPendingTasks
      ? [{
          value: 'resume_microtasks' as const,
          label: 'Resume Pending Microtasks',
          hint: 'Jump back into the current session',
        }]
      : []),
    {
      value: 'gatekeeper',
      label: 'Audit Uncommitted Changes',
      hint: 'Run hygiene and gatekeeper on manual edits',
    },
    {
      value: 'status',
      label: 'View Project Status',
      hint: 'Session, task, and git summary',
    },
    {
      value: 'exit',
      label: 'Exit',
    },
  ];
}

export async function showMainMenu(hasPendingTasks: boolean): Promise<MainMenuAction> {
  const action = await p.select({
    message: CYAN('Main Menu - What would you like to do?'),
    options: buildMainMenuOptions(hasPendingTasks),
  });

  if (p.isCancel(action)) {
    return 'exit';
  }

  return action as MainMenuAction;
}

export async function askGoal(): Promise<string | null> {
  const goal = await p.text({
    message: CYAN('What would you like to build or refactor?'),
    placeholder: 'e.g. Build a mini HTML5 platformer with scoring and pause',
    validate: (value) => {
      if (!value || value.trim().length === 0) return 'Goal cannot be empty';
    },
  });

  if (p.isCancel(goal)) {
    return null;
  }

  return String(goal).trim();
}

export async function selectMicrotasks(microtasks: Microtask[]): Promise<Microtask[] | null> {
  const selectedIds = await p.multiselect({
    message: CYAN('Select microtasks to execute:'),
    options: microtasks.map((mt) => ({
      value: mt.id,
      label: `${mt.id}: ${mt.title}`,
      hint: mt.expected_files.length > 0 ? `${mt.expected_files.length} files` : undefined,
    })),
    required: true,
  });

  if (p.isCancel(selectedIds)) {
    return null;
  }

  return microtasks.filter((mt) => (selectedIds as string[]).includes(mt.id));
}

export async function confirmDiff(
  diff: string,
  commitMessage: string,
  opts: { allowRetry?: boolean } = {},
): Promise<'commit' | 'amend' | 'retry' | 'abort'> {
  const allowRetry = opts.allowRetry ?? true;
  const lines = diff.split('\n');
  const coloredDiff = lines.map((line) => {
    if (line.startsWith('+') && !line.startsWith('+++')) return chalk.green(line);
    if (line.startsWith('-') && !line.startsWith('---')) return chalk.red(line);
    if (line.startsWith('@@')) return chalk.gray(line);
    return line;
  }).join('\n');

  p.note(coloredDiff, 'Patch Preview');
  p.note(commitMessage, 'Suggested Commit');

  const action = await p.select({
    message: CYAN('Gatekeeper approved this patch. How do you want to proceed?'),
    options: [
      { value: 'commit', label: 'Approve and commit' },
      { value: 'amend', label: 'Approve and amend previous commit' },
      ...(allowRetry ? [{ value: 'retry', label: 'Reject and request another attempt' }] : []),
      { value: 'abort', label: 'Abort' },
    ],
  });

  if (p.isCancel(action)) {
    return 'abort';
  }

  return action as 'commit' | 'amend' | 'retry' | 'abort';
}

export async function confirmGatekeeperOverride(
  diff: string,
  commitMessage: string,
): Promise<'commit' | 'amend' | 'abort'> {
  const lines = diff.split('\n');
  const coloredDiff = lines.map((line) => {
    if (line.startsWith('+') && !line.startsWith('+++')) return chalk.green(line);
    if (line.startsWith('-') && !line.startsWith('---')) return chalk.red(line);
    if (line.startsWith('@@')) return chalk.gray(line);
    return line;
  }).join('\n');

  p.note(coloredDiff, 'Patch Preview');
  p.note(commitMessage, 'Suggested Commit');

  const action = await p.select({
    message: CYAN('Gatekeeper rejected this patch. Commit anyway?'),
    options: [
      { value: 'commit', label: 'Commit anyway' },
      { value: 'amend', label: 'Amend previous commit' },
      { value: 'abort', label: 'Abort' },
    ],
  });

  if (p.isCancel(action)) {
    return 'abort';
  }

  return action as 'commit' | 'amend' | 'abort';
}
