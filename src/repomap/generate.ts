import fg from 'fast-glob';
import { readFile, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import type { RepoMapConfig } from '../config/schema.js';

export interface RepoMapEntry {
  path: string;
  size: number;
  mtime: string;
  preview?: string;
}

export interface RepoMap {
  schema_version: 'nerdforge.repo-map.v1';
  generated_at: string;
  cwd: string;
  total_files: number;
  total_bytes: number;
  files: RepoMapEntry[];
}

export async function generateRepoMap(
  cwd: string,
  cfg: RepoMapConfig,
): Promise<RepoMap> {
  const entries = await fg(cfg.include, {
    cwd,
    ignore: cfg.exclude,
    dot: false,
    onlyFiles: true,
    followSymbolicLinks: false,
    absolute: false,
  });

  const files: RepoMapEntry[] = [];
  let totalBytes = 0;
  for (const rel of entries.sort()) {
    const abs = resolve(cwd, rel);
    let s: Awaited<ReturnType<typeof stat>>;
    try {
      s = await stat(abs);
    } catch {
      continue;
    }
    if (!s.isFile()) continue;
    totalBytes += s.size;
    const entry: RepoMapEntry = {
      path: relative(cwd, abs).replaceAll('\\', '/'),
      size: s.size,
      mtime: s.mtime.toISOString(),
    };
    if (cfg.preview_chars > 0 && s.size > 0) {
      entry.preview = await readPreview(abs, cfg.preview_chars);
    }
    files.push(entry);
  }
  return {
    schema_version: 'nerdforge.repo-map.v1',
    generated_at: new Date().toISOString(),
    cwd,
    total_files: files.length,
    total_bytes: totalBytes,
    files,
  };
}

async function readPreview(file: string, chars: number): Promise<string> {
  const buf = await readFile(file);
  return buf.toString('utf8', 0, Math.min(chars, buf.length));
}
