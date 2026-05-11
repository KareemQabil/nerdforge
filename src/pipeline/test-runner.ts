import fs from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';

export interface TestResult {
  passed: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
}

const installCache = new Set<string>();

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

  await ensureDependencies(cwd);

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

async function ensureDependencies(cwd: string): Promise<void> {
  if (installCache.has(cwd)) {
    return;
  }

  const packageJson = path.join(cwd, 'package.json');
  const nodeModules = path.join(cwd, 'node_modules');

  if (!fs.existsSync(packageJson) || fs.existsSync(nodeModules)) {
    installCache.add(cwd);
    return;
  }

  const { manager, args } = detectPackageManager(cwd);

  try {
    await execa(manager, args, {
      cwd,
      reject: false,
      timeout: 600000,
      stdio: 'inherit',
    });
  } finally {
    installCache.add(cwd);
  }
}

function detectPackageManager(cwd: string): { manager: string; args: string[] } {
  const has = (filename: string) => fs.existsSync(path.join(cwd, filename));

  if (has('pnpm-lock.yaml')) {
    return { manager: 'pnpm', args: ['install'] };
  }
  if (has('yarn.lock')) {
    return { manager: 'yarn', args: ['install'] };
  }
  if (has('bun.lockb') || has('bun.lock')) {
    return { manager: 'bun', args: ['install'] };
  }

  return { manager: 'npm', args: ['install'] };
}
