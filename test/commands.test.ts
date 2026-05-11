import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { cmdInit } from '../src/cli/commands/init.js';
import { cmdDoctor } from '../src/cli/commands/doctor.js';
import { cmdRepoMap } from '../src/cli/commands/repomap.js';
import { cmdStatus } from '../src/cli/commands/status.js';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'nerdforge-cmd-'));
}

describe('init', () => {
  it('creates nerdforge.yaml and the artifacts dir', async () => {
    const dir = tmp();
    await cmdInit(dir);
    expect(existsSync(join(dir, 'nerdforge.yaml'))).toBe(true);
    expect(existsSync(join(dir, '.nerdforge/config.resolved.json'))).toBe(true);
    expect(existsSync(join(dir, '.nerdforge/state.json'))).toBe(true);
    const resolved = JSON.parse(
      readFileSync(join(dir, '.nerdforge/config.resolved.json'), 'utf8'),
    );
    expect(resolved.router.name).toBe('nerdpos');
    rmSync(dir, { recursive: true });
  });

  it('is idempotent — re-running does not error', async () => {
    const dir = tmp();
    await cmdInit(dir);
    await cmdInit(dir);
    expect(existsSync(join(dir, 'nerdforge.yaml'))).toBe(true);
    rmSync(dir, { recursive: true });
  });
});

describe('doctor', () => {
  it('reports all green when env is healthy', async () => {
    const dir = tmp();
    const git = simpleGit({ baseDir: dir });
    await git.init();
    await git.addConfig('user.email', 'x@y');
    await git.addConfig('user.name', 'x');
    await cmdInit(dir);
    process.env.DIGITALOCEAN_TOKEN = 'fake-token-for-doctor';
    process.exitCode = 0;
    await cmdDoctor(dir);
    expect(process.exitCode).toBeFalsy();
    rmSync(dir, { recursive: true });
  });

  it('non-zero exit when nerdforge.yaml is missing', async () => {
    const dir = tmp();
    process.exitCode = 0;
    await cmdDoctor(dir);
    expect(process.exitCode).toBe(2);
    process.exitCode = 0;
    rmSync(dir, { recursive: true });
  });
});

describe('repomap', () => {
  it('writes a deterministic repo-map artifact', async () => {
    const dir = tmp();
    await cmdInit(dir);
    writeFileSync(join(dir, 'package.json'), '{}');
    await cmdRepoMap(dir);
    const map = JSON.parse(readFileSync(join(dir, '.nerdforge/repo-map.json'), 'utf8'));
    expect(map.schema_version).toBe('nerdforge.repo-map.v1');
    expect(Array.isArray(map.files)).toBe(true);
    rmSync(dir, { recursive: true });
  });
});

describe('status', () => {
  it('runs without throwing on a fresh repo', async () => {
    const dir = tmp();
    const git = simpleGit({ baseDir: dir });
    await git.init();
    await git.addConfig('user.email', 'x@y');
    await git.addConfig('user.name', 'x');
    await cmdInit(dir);
    await cmdStatus(dir);
    rmSync(dir, { recursive: true });
  });
});
