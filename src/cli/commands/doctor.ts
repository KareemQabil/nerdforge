import type { Command } from 'commander';
import { execSync } from 'node:child_process';
import { loadConfig, resolveAuthToken } from '../../config/loader.js';
import { AUTH_ENV_VARS } from '../../types/constants.js';

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Validate environment and configuration')
    .action(async () => {
      const cwd = process.cwd();
      let allOk = true;

      // 1. Config
      try {
        const config = loadConfig(cwd);
        console.log('✓ nerdforge.yaml is valid');

        // 2. Auth token
        try {
          resolveAuthToken(config);
          console.log('✓ API token found');
        } catch {
          console.error(`✗ No API token. Set one of: ${AUTH_ENV_VARS.join(', ')}`);
          allOk = false;
        }

        // 3. Router reachability
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const resp = await fetch(config.router.base_url, {
            method: 'HEAD',
            signal: controller.signal,
          });
          clearTimeout(timeout);
          console.log(`✓ Router reachable (${resp.status})`);
        } catch {
          console.log('⚠ Router not reachable (may be OK if offline)');
        }
      } catch (err) {
        console.error(`✗ ${(err as Error).message}`);
        allOk = false;
      }

      // 4. Git
      try {
        execSync('git --version', { stdio: 'pipe' });
        console.log('✓ git is installed');
      } catch {
        console.error('✗ git not found in PATH');
        allOk = false;
      }

      // 5. Is git repo
      try {
        execSync('git rev-parse --is-inside-work-tree', { cwd, stdio: 'pipe' });
        console.log('✓ Current directory is a git repository');
      } catch {
        console.error('✗ Not a git repository. Run "git init" first.');
        allOk = false;
      }

      console.log(allOk ? '\n✓ All checks passed' : '\n✗ Some checks failed');
      if (!allOk) process.exitCode = 1;
    });
}
