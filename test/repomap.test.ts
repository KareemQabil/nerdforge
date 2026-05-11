import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateRepoMap } from '../src/repomap/generate.js';
import { RepoMapConfigSchema } from '../src/config/schema.js';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'nerdforge-repomap-'));
}

describe('repo map', () => {
  it('lists included files and respects excludes', async () => {
    const dir = tmp();
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, 'node_modules'));
    writeFileSync(join(dir, 'src/a.ts'), 'export const a = 1;');
    writeFileSync(join(dir, 'src/b.ts'), 'export const b = 2;');
    writeFileSync(join(dir, 'node_modules/x.js'), 'ignored');
    writeFileSync(join(dir, 'package.json'), '{}');

    const cfg = RepoMapConfigSchema.parse({
      include: ['src/**', 'package.json'],
      exclude: ['node_modules/**'],
    });
    const map = await generateRepoMap(dir, cfg);
    const paths = map.files.map((f) => f.path).sort();
    expect(paths).toEqual(['package.json', 'src/a.ts', 'src/b.ts']);
    expect(map.total_files).toBe(3);
    expect(map.total_bytes).toBeGreaterThan(0);
    rmSync(dir, { recursive: true });
  });

  it('embeds preview when preview_chars > 0', async () => {
    const dir = tmp();
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src/x.ts'), 'hello world');
    const cfg = RepoMapConfigSchema.parse({
      include: ['src/**'],
      exclude: [],
      preview_chars: 5,
    });
    const map = await generateRepoMap(dir, cfg);
    expect(map.files[0]!.preview).toBe('hello');
    rmSync(dir, { recursive: true });
  });
});
