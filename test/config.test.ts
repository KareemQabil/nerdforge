import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config/loader.js';
import { NerdforgeConfigSchema } from '../src/config/schema.js';
import { isNerdforgeError } from '../src/utils/errors.js';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'nerdforge-test-'));
}

describe('config', () => {
  it('loads a minimal YAML and fills defaults', async () => {
    const dir = tmp();
    writeFileSync(
      join(dir, 'nerdforge.yaml'),
      'router:\n  base_url: "https://example.com"\n',
    );
    const cfg = await loadConfig(dir);
    expect(cfg.router.base_url).toBe('https://example.com');
    expect(cfg.router.name).toBe('nerdpos');
    expect(cfg.workflow.max_worker_attempts).toBe(3);
    expect(cfg.repo_map.include).toContain('src/**');
    rmSync(dir, { recursive: true });
  });

  it('reports CONFIG_MISSING when nerdforge.yaml is absent', async () => {
    const dir = tmp();
    await expect(loadConfig(dir)).rejects.toMatchObject({ code: 'CONFIG_MISSING' });
    rmSync(dir, { recursive: true });
  });

  it('rejects malformed YAML', async () => {
    const dir = tmp();
    writeFileSync(join(dir, 'nerdforge.yaml'), 'router: [unclosed');
    await expect(loadConfig(dir)).rejects.toSatisfy((e: unknown) =>
      isNerdforgeError(e) && e.code === 'CONFIG_INVALID_YAML',
    );
    rmSync(dir, { recursive: true });
  });

  it('rejects schema-invalid values', async () => {
    const dir = tmp();
    writeFileSync(
      join(dir, 'nerdforge.yaml'),
      'workflow:\n  max_worker_attempts: 99\n',
    );
    await expect(loadConfig(dir)).rejects.toMatchObject({
      code: 'CONFIG_INVALID_SCHEMA',
    });
    rmSync(dir, { recursive: true });
  });

  it('NerdforgeConfigSchema accepts empty object via defaults', () => {
    const parsed = NerdforgeConfigSchema.parse({});
    expect(parsed.router.name).toBe('nerdpos');
    expect(parsed.auth.do_api_token_env).toBe('DIGITALOCEAN_TOKEN');
  });
});
