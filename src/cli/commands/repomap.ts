import type { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, loadConfigStrict } from '../../config/loader.js';
import { generateRepoMap } from '../../repomap/generator.js';
import { ARTIFACTS_DIR } from '../../types/constants.js';

export function registerRepomapCommand(program: Command): void {
  program
    .command('repomap')
    .description('Generate repository map')
    .action(async () => {
      const cwd = process.cwd();
      const config = loadConfigStrict(cwd);
      const repoMap = await generateRepoMap(cwd, config);

      const outDir = path.join(cwd, ARTIFACTS_DIR);
      fs.mkdirSync(outDir, { recursive: true });
      const outPath = path.join(outDir, 'repo-map.json');
      fs.writeFileSync(outPath, JSON.stringify(repoMap, null, 2), 'utf-8');

      console.log(`✓ Repo map generated: ${repoMap.total_files} files`);
      console.log(`  Saved: ${outPath}`);
    });
}
