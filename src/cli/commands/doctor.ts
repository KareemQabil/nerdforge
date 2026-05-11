import { existsSync } from 'node:fs';
import { execa } from 'execa';
import { loadConfig } from '../../config/loader.js';
import { Paths } from '../../storage/paths.js';
import { GitOps } from '../../git/ops.js';
import { log } from '../../utils/logger.js';

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export async function cmdDoctor(cwd: string): Promise<void> {
  const checks: Check[] = [];

  const cfgPath = `${cwd}/nerdforge.yaml`;
  const hasCfg = existsSync(cfgPath);
  checks.push({
    name: 'nerdforge.yaml present',
    ok: hasCfg,
    detail: hasCfg ? cfgPath : `missing — run 'nerdforge init'`,
  });

  let envName = 'DIGITALOCEAN_TOKEN';
  if (hasCfg) {
    try {
      const cfg = await loadConfig(cwd);
      envName = cfg.auth.do_api_token_env;
      const paths = new Paths(cwd, cfg);
      checks.push({
        name: 'config schema valid',
        ok: true,
        detail: `router=${cfg.router.name} base_url=${cfg.router.base_url}`,
      });
      checks.push({
        name: 'artifacts dir',
        ok: existsSync(paths.root()),
        detail: paths.root(),
      });
    } catch (e) {
      checks.push({ name: 'config schema valid', ok: false, detail: (e as Error).message });
    }
  }

  checks.push({
    name: `${envName} set`,
    ok: !!process.env[envName],
    detail: process.env[envName] ? `(${envName} is set)` : `export ${envName}=...`,
  });

  try {
    const r = await execa('git', ['--version']);
    checks.push({ name: 'git installed', ok: true, detail: r.stdout.trim() });
  } catch {
    checks.push({ name: 'git installed', ok: false, detail: 'git not found in PATH' });
  }

  const git = new GitOps(cwd);
  const isRepo = await git.isRepo();
  checks.push({
    name: 'cwd is a git repo',
    ok: isRepo,
    detail: isRepo ? `branch=${await git.currentBranch()}` : 'run `git init`',
  });

  const summary = {
    cwd,
    all_ok: checks.every((c) => c.ok),
    checks,
  };

  for (const c of checks) {
    if (c.ok) log.ok(`${c.name}: ${c.detail}`);
    else log.err(`${c.name}: ${c.detail}`);
  }
  log.out(summary);
  if (!summary.all_ok) process.exitCode = 2;
}
