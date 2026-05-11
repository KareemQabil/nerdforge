import { execa } from 'execa';

export interface TestResult {
  passed: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
}

/**
 * Run a test command and capture full output.
 * Never throws — always returns a result.
 */
export async function runTests(
  command: string,
  cwd: string,
): Promise<TestResult> {
  const start = Date.now();
  const [cmd, ...args] = command.split(' ');

  try {
    const result = await execa(cmd, args, {
      cwd,
      reject: false,
      timeout: 120000,
    });

    return {
      passed: result.exitCode === 0,
      exitCode: result.exitCode ?? 1,
      stdout: result.stdout,
      stderr: result.stderr,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    return {
      passed: false,
      exitCode: 1,
      stdout: '',
      stderr: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - start,
    };
  }
}
