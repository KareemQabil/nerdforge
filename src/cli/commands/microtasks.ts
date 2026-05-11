import { existsSync } from 'node:fs';
import { loadContext } from './_shared.js';
import { readJson, writeJson, latestSession } from '../../storage/artifacts.js';
import { BlueprintSchema } from '../../schemas/blueprint.js';
import { MicrotaskListSchema } from '../../schemas/microtask.js';
import { patchState } from '../../storage/state.js';
import { NerdforgeError } from '../../utils/errors.js';
import { log } from '../../utils/logger.js';

/**
 * Normalise the blueprint's microtask list into a standalone artifact that
 * `nerdforge work` consumes. We do NOT round-trip through the router here —
 * blueprint already produced normalised microtasks.
 */
export async function cmdMicrotasks(cwd: string): Promise<void> {
  const ctx = await loadContext(cwd);
  const sessionDir = await latestSession(ctx.paths.sessionsRoot());
  if (!sessionDir) {
    throw new NerdforgeError(
      'No session found. Run `nerdforge blueprint` first.',
      'MT_NO_SESSION',
    );
  }
  const bpFile = ctx.paths.blueprintFile(sessionDir);
  if (!existsSync(bpFile)) {
    throw new NerdforgeError(`Missing blueprint at ${bpFile}`, 'MT_NO_BLUEPRINT');
  }
  const raw = await readJson<unknown>(bpFile);
  const parsed = BlueprintSchema.safeParse(raw);
  if (!parsed.success) {
    throw new NerdforgeError(
      `Blueprint invalid: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
      'MT_BAD_BLUEPRINT',
    );
  }
  const list = MicrotaskListSchema.parse({
    schema_version: 'nerdforge.microtasks.v1',
    source_blueprint: bpFile,
    microtasks: parsed.data.microtasks,
  });
  const outFile = ctx.paths.microtasksFile(sessionDir);
  await writeJson(outFile, list);
  await patchState(ctx.paths.state(), { lastMicrotasksPath: outFile });

  log.ok(`wrote ${outFile} (${list.microtasks.length} microtasks)`);
  log.out({
    action: 'microtasks',
    file: outFile,
    microtasks: list.microtasks.map((m) => ({ id: m.id, title: m.title })),
  });
}
