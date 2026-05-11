import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import type { NerdforgeConfig } from '../types/config.js';
import type { RepoMap } from '../types/repomap.js';

/**
 * Scan repo files per config globs and build a lightweight repo map.
 * No file content is included — just metadata for context budgeting.
 */
export async function generateRepoMap(
  cwd: string,
  config: NerdforgeConfig,
): Promise<RepoMap> {
  const files = await glob(config.repo_map.include, {
    cwd,
    ignore: config.repo_map.exclude,
    nodir: true,
    dot: false,
  });

  const entries = files.sort().map((filePath) => {
    const fullPath = path.join(cwd, filePath);
    const stat = fs.statSync(fullPath);
    return {
      path: filePath.replace(/\\/g, '/'),
      size_bytes: stat.size,
      modified_at: stat.mtime.toISOString(),
    };
  });

  return {
    generated_at: new Date().toISOString(),
    root: cwd.replace(/\\/g, '/'),
    total_files: entries.length,
    files: entries,
  };
}
