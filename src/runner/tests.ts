import { execa } from 'execa';

export interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/**
 * Run a shell-like command (split on spaces) and capture its full output.
 * Never throws on non-zero exit; the caller decides what to do.
 */
export async function runCommand(
  command: string,
  cwd: string,
  timeoutMs = 120_000,
): Promise<CommandResult> {
  const start = Date.now();
  const [bin, ...args] = command.trim().split(/\s+/);
  if (!bin) {
    return { command, exitCode: 0, stdout: '', stderr: '', durationMs: 0 };
  }
  const proc = await execa(bin, args, {
    cwd,
    reject: false,
    timeout: timeoutMs,
    env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
  });
  return {
    command,
    exitCode: typeof proc.exitCode === 'number' ? proc.exitCode : 1,
    stdout: proc.stdout ?? '',
    stderr: proc.stderr ?? '',
    durationMs: Date.now() - start,
  };
}

export function formatCommandLog(result: CommandResult): string {
  return [
    `$ ${result.command}`,
    `exit_code: ${result.exitCode}`,
    `duration_ms: ${result.durationMs}`,
    '--- stdout ---',
    result.stdout,
    '--- stderr ---',
    result.stderr,
  ].join('\n');
}
