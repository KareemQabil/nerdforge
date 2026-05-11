import type { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_TEMPLATE } from '../../config/template.js';
import { loadConfig, writeResolvedConfig } from '../../config/loader.js';
import { ARTIFACTS_DIR } from '../../types/constants.js';

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize nerdforge config and state directory')
    .action(async () => {
      const cwd = process.cwd();
      const configPath = path.join(cwd, 'nerdforge.yaml');
      const artifactsDir = path.join(cwd, ARTIFACTS_DIR);

      // Create config file
      if (fs.existsSync(configPath)) {
        console.log('✓ nerdforge.yaml already exists, skipping');
      } else {
        fs.writeFileSync(configPath, CONFIG_TEMPLATE, 'utf-8');
        console.log('✓ Created nerdforge.yaml');
      }

      // Create artifacts directory structure
      const dirs = [
        artifactsDir,
        path.join(artifactsDir, 'sessions'),
        path.join(artifactsDir, 'cache'),
      ];
      for (const dir of dirs) {
        fs.mkdirSync(dir, { recursive: true });
      }
      console.log(`✓ Created ${ARTIFACTS_DIR}/ directory`);

      // Validate and write resolved config
      try {
        const config = loadConfig(cwd);
        writeResolvedConfig(config, cwd);
        console.log('✓ Wrote config.resolved.json');
      } catch (err) {
        console.error(`⚠ Config validation issue: ${(err as Error).message}`);
      }

      console.log('\n✓ nerdforge initialized. Run "nerdforge doctor" to verify environment.');
    });
}
