import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import YAML from 'yaml';
import { NerdforgeConfigSchema, type NerdforgeConfig } from './schema.js';
import { NerdforgeError } from '../utils/errors.js';

export const DEFAULT_CONFIG_FILE = 'nerdforge.yaml';

export async function loadConfig(cwd: string): Promise<NerdforgeConfig> {
  const file = resolve(cwd, DEFAULT_CONFIG_FILE);
  if (!existsSync(file)) {
    throw new NerdforgeError(
      `Missing ${DEFAULT_CONFIG_FILE} at ${cwd}. Run 'nerdforge init' first.`,
      'CONFIG_MISSING',
    );
  }
  const raw = await readFile(file, 'utf8');
  let parsed: unknown;
  try {
    parsed = YAML.parse(raw);
  } catch (e) {
    throw new NerdforgeError(
      `Failed to parse ${DEFAULT_CONFIG_FILE}: ${(e as Error).message}`,
      'CONFIG_INVALID_YAML',
    );
  }
  const result = NerdforgeConfigSchema.safeParse(parsed ?? {});
  if (!result.success) {
    throw new NerdforgeError(
      `Invalid ${DEFAULT_CONFIG_FILE}:\n${formatZodError(result.error)}`,
      'CONFIG_INVALID_SCHEMA',
    );
  }
  return result.data;
}

export async function writeResolvedConfig(
  cwd: string,
  config: NerdforgeConfig,
): Promise<string> {
  const out = resolve(cwd, config.workflow.artifacts_dir, 'config.resolved.json');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(config, null, 2), 'utf8');
  return out;
}

export async function writeConfigTemplate(
  cwd: string,
  templateContent: string,
): Promise<string> {
  const out = resolve(cwd, DEFAULT_CONFIG_FILE);
  if (existsSync(out)) {
    throw new NerdforgeError(
      `${DEFAULT_CONFIG_FILE} already exists at ${out}`,
      'CONFIG_ALREADY_EXISTS',
    );
  }
  await writeFile(out, templateContent, 'utf8');
  return out;
}

function formatZodError(err: import('zod').ZodError): string {
  return err.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
}
