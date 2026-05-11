import { mkdir } from 'node:fs/promises';
import { writeConfigTemplate, writeResolvedConfig, loadConfig } from '../../config/loader.js';
import { DEFAULT_CONFIG_TEMPLATE } from '../../config/template.js';
import { Paths } from '../../storage/paths.js';
import { writeState } from '../../storage/state.js';
import { StateSchema } from '../../storage/state.js';
import { log } from '../../utils/logger.js';
import { isNerdforgeError } from '../../utils/errors.js';

export async function cmdInit(cwd: string): Promise<void> {
  let createdYaml = false;
  try {
    const out = await writeConfigTemplate(cwd, DEFAULT_CONFIG_TEMPLATE);
    log.ok(`wrote ${out}`);
    createdYaml = true;
  } catch (e) {
    if (isNerdforgeError(e) && e.code === 'CONFIG_ALREADY_EXISTS') {
      log.info('nerdforge.yaml already exists — leaving in place');
    } else {
      throw e;
    }
  }

  const cfg = await loadConfig(cwd);
  const paths = new Paths(cwd, cfg);
  await mkdir(paths.root(), { recursive: true });
  await mkdir(paths.sessionsRoot(), { recursive: true });
  const resolved = await writeResolvedConfig(cwd, cfg);
  log.ok(`wrote ${resolved}`);
  await writeState(paths.state(), StateSchema.parse({}));
  log.ok(`wrote ${paths.state()}`);

  log.out({
    action: 'init',
    created_yaml: createdYaml,
    config_file: 'nerdforge.yaml',
    artifacts_dir: cfg.workflow.artifacts_dir,
  });
}
