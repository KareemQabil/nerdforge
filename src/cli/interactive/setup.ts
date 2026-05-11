import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import * as p from '@clack/prompts';
import chalk from 'chalk';
import { CONFIG_TEMPLATE } from '../../config/template.js';
import { ARTIFACTS_DIR } from '../../types/constants.js';
import { cancelWithError } from '../../ui/components.js';

/**
 * Ensures the directory is a git repo and configuration is present.
 * If not, interactive prompts help the user set it up globally or locally.
 */
export async function runInteractiveSetup(cwd: string): Promise<void> {
  const isGit = verifyGit(cwd);
  if (!isGit) {
    const doGit = await p.confirm({
      message: chalk.cyan('Not a Git repository. Initialize Git now? (Required for safe patching)'),
      initialValue: true,
    });
    if (!doGit || p.isCancel(doGit)) cancelWithError('Git is required to use nerdforge safely.');
    
    const s = p.spinner();
    s.start('Initializing Git...');
    execSync('git init', { cwd, stdio: 'ignore' });
    s.stop('Git initialized.');
  }

  const localConfigPath = path.join(cwd, 'nerdforge.yaml');
  const globalConfigPath = path.join(os.homedir(), '.nerdforge', 'config.yaml');

  // If local config exists, we are good.
  if (fs.existsSync(localConfigPath)) return;
  
  // If global config exists, optionally create local
  if (fs.existsSync(globalConfigPath)) {
    const createLocal = await p.confirm({
      message: chalk.cyan('Global config found. Create local nerdforge.yaml override for this project?'),
      initialValue: false,
    });
    if (createLocal && !p.isCancel(createLocal)) {
      createLocalConfig(cwd, localConfigPath);
    }
  } else {
    // No config anywhere. Need token and global setup.
    p.note('No configuration found. Let\'s set up Nerdforge V2.', 'Setup');
    
    const token = await p.text({
      message: chalk.cyan('Enter your DigitalOcean Inference Model Access Key:'),
      placeholder: 'doo_v1_...',
      validate: (v) => (!v || v.length < 20) ? 'Token seems too short' : undefined,
    });
    if (p.isCancel(token)) cancelWithError('Setup cancelled.');

    const globalDir = path.join(os.homedir(), '.nerdforge');
    fs.mkdirSync(globalDir, { recursive: true });
    
    // Inject token into template for global config
    const customTemplate = CONFIG_TEMPLATE + `\n# Auth injected during setup\nenv:\n  DO_MODEL_ACCESS_KEY: "${token}"\n`;
    fs.writeFileSync(globalConfigPath, customTemplate, 'utf-8');
    
    p.log.success(`Saved global config and token to ${globalConfigPath}`);
    
    const createLocal = await p.confirm({
      message: chalk.cyan('Create a local nerdforge.yaml for this project too?'),
      initialValue: true,
    });
    if (createLocal && !p.isCancel(createLocal)) {
      createLocalConfig(cwd, localConfigPath);
    }
  }

  // Ensure artifacts dir
  fs.mkdirSync(path.join(cwd, ARTIFACTS_DIR), { recursive: true });
}

function verifyGit(cwd: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function createLocalConfig(cwd: string, configPath: string) {
  fs.writeFileSync(configPath, CONFIG_TEMPLATE, 'utf-8');
  p.log.success('Created local nerdforge.yaml');
}
