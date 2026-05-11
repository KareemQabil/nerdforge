import { loadContext } from './_shared.js';
import { generateRepoMap } from '../../repomap/generate.js';
import { writeJson } from '../../storage/artifacts.js';
import { log } from '../../utils/logger.js';

export async function cmdRepoMap(cwd: string): Promise<void> {
  const ctx = await loadContext(cwd);
  const map = await generateRepoMap(cwd, ctx.cfg.repo_map);
  const out = await writeJson(ctx.paths.repoMap(), map);
  log.ok(`wrote ${out} (${map.total_files} files, ${map.total_bytes} bytes)`);
  log.out({ action: 'repomap', file: out, total_files: map.total_files });
}
