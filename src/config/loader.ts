import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import os from 'node:os';
import { NerdforgeConfigSchema, type NerdforgeConfig } from '../types/config.js';
import { AUTH_ENV_VARS, ARTIFACTS_DIR } from '../types/constants.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeConfigValues(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (isRecord(value) && isRecord(result[key])) {
      result[key] = mergeConfigValues(result[key] as Record<string, unknown>, value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Load and validate nerdforge.yaml from the given directory.
 * Returns validated config with defaults applied.
 */
export function loadConfig(cwd: string): NerdforgeConfig | null {
  const localConfigPath = path.join(cwd, 'nerdforge.yaml');
  const globalConfigPath = path.join(os.homedir(), '.nerdforge', 'config.yaml');

  const hasLocal = fs.existsSync(localConfigPath);
  const hasGlobal = fs.existsSync(globalConfigPath);

  if (!hasLocal && !hasGlobal) {
    return null;
  }

  let configPath = hasLocal ? localConfigPath : globalConfigPath;
  let parsed: Record<string, unknown> = {};

  if (hasGlobal) {
    const rawGlobal = fs.readFileSync(globalConfigPath, 'utf-8');
    const parsedGlobal = (YAML.parse(rawGlobal) ?? {}) as Record<string, unknown>;
    parsed = mergeConfigValues(parsed, parsedGlobal);
  }

  if (hasLocal) {
    const rawLocal = fs.readFileSync(localConfigPath, 'utf-8');
    const parsedLocal = (YAML.parse(rawLocal) ?? {}) as Record<string, unknown>;
    parsed = mergeConfigValues(parsed, parsedLocal);
  }

  if (hasLocal && hasGlobal) {
    configPath = `${globalConfigPath} + ${localConfigPath}`;
  }

  const result = NerdforgeConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid configuration (${configPath}):\n${issues}`);
  }

  return result.data;
}

/**
 * Load config, but throw if missing. Useful for non-interactive commands.
 */
export function loadConfigStrict(cwd: string): NerdforgeConfig {
  const config = loadConfig(cwd);
  if (!config) {
    throw new Error(`Config not found.\nRun 'nerdforge init' or use interactive mode to create one.`);
  }
  return config;
}

/**
 * Resolve the API token from environment variables.
 * Checks multiple env var names in precedence order.
 */
export function resolveAuthToken(config: NerdforgeConfig): string {
  // First try the config-specified env var in config.env
  const configEnv = config.auth.do_api_token_env;
  if (config.env[configEnv]) {
    return config.env[configEnv];
  }

  // Then try process.env for the config-specified env var
  if (process.env[configEnv]) {
    return process.env[configEnv]!;
  }

  // Then try known env var names in config.env
  for (const envVar of AUTH_ENV_VARS) {
    if (config.env[envVar]) {
      return config.env[envVar];
    }
  }

  // Then try known env var names in process.env
  for (const envVar of AUTH_ENV_VARS) {
    if (process.env[envVar]) {
      return process.env[envVar]!;
    }
  }

  throw new Error(
    `No API token found. Set one of: ${AUTH_ENV_VARS.join(', ')}\n` +
    `Or set the env var specified in config: ${configEnv}`
  );
}

/**
 * Write resolved config to .nerdforge/config.resolved.json
 */
export function writeResolvedConfig(config: NerdforgeConfig, cwd: string): void {
  const dir = path.join(cwd, ARTIFACTS_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'config.resolved.json'),
    JSON.stringify(config, null, 2),
    'utf-8',
  );
}
