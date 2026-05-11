import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { loadContext, makeRouter } from './_shared.js';
import { generateRepoMap } from '../../repomap/generate.js';
import { readJson, writeJson, newSessionId } from '../../storage/artifacts.js';
import { patchState } from '../../storage/state.js';
import { BlueprintSchema } from '../../schemas/blueprint.js';
import { ROUTER_TASKS } from '../../config/tasks.js';
import { buildPrompt, SCHEMA_TAGS } from '../../router/prompt.js';
import { log } from '../../utils/logger.js';

export interface BlueprintOptions {
  goal: string;
  context?: string;
}

export async function cmdBlueprint(cwd: string, opts: BlueprintOptions): Promise<void> {
  const ctx = await loadContext(cwd);
  const router = makeRouter(ctx);

  // Ensure we have a repo map summary to feed the architect.
  const repoMapPath = ctx.paths.repoMap();
  let repoMap: unknown;
  if (existsSync(repoMapPath)) {
    repoMap = await readJson(repoMapPath);
  } else {
    log.info('no repo-map.json found, generating one');
    repoMap = await generateRepoMap(cwd, ctx.cfg.repo_map);
    await writeJson(repoMapPath, repoMap);
  }

  const summary = summariseRepoMap(repoMap);
  const body = [
    `GOAL: ${opts.goal}`,
    opts.context ? `CONTEXT: ${opts.context}` : '',
    `REPO_MAP_SUMMARY:\n${summary}`,
    `REQUIRED_RESPONSE_SHAPE (nerdforge.blueprint.v1):`,
    JSON.stringify(
      {
        schema_version: 'nerdforge.blueprint.v1',
        system_name: '<short>',
        goal: opts.goal,
        domain_modules: ['<module>'],
        database: {
          entities: [{ name: '<Entity>', fields: [{ name: 'id', type: 'uuid' }] }],
          relationships: [
            { from: '<EntityA>', to: '<EntityB>', kind: 'one-to-many' },
          ],
        },
        invariants: ['<rule>'],
        microtasks: [
          {
            id: 'MT-001',
            title: '<short>',
            description: '<one paragraph>',
            expected_files: ['<path>'],
            tests: { new: ['<path>'], modified: [], commands: ['yarn test'] },
            acceptance_criteria: ['<criterion>'],
            invariants: ['<rule>'],
            tracing_proof_requirements: ['<evidence>'],
          },
        ],
      },
      null,
      2,
    ),
  ]
    .filter(Boolean)
    .join('\n\n');

  const prompt = buildPrompt({
    task: ROUTER_TASKS.ARCHITECTURE_BLUEPRINT,
    schemaTag: SCHEMA_TAGS.BLUEPRINT,
    hardConstraints: [
      'no implementation code',
      'every microtask id matches /^MT-\\d{3,}$/',
      'expected_files must reference existing or proposed paths only',
      'database entities must have at least one field with id-like type',
    ],
    body,
  });

  log.info(`requesting blueprint via task ${ROUTER_TASKS.ARCHITECTURE_BLUEPRINT}`);
  const { data } = await router.invokeTask(
    ROUTER_TASKS.ARCHITECTURE_BLUEPRINT,
    prompt,
    BlueprintSchema,
  );

  const sessionId = newSessionId();
  const sessionDir = ctx.paths.session(sessionId);
  const blueprintFile = join(sessionDir, 'blueprint.json');
  await writeJson(blueprintFile, data);

  await patchState(ctx.paths.state(), {
    currentSessionId: sessionId,
    lastBlueprintPath: blueprintFile,
  });
  log.ok(`blueprint saved → ${blueprintFile}`);
  log.out({
    action: 'blueprint',
    session_id: sessionId,
    file: blueprintFile,
    microtask_count: data.microtasks.length,
  });
}

function summariseRepoMap(map: unknown): string {
  const m = map as { total_files?: number; total_bytes?: number; files?: { path: string; size: number }[] };
  const files = (m.files ?? []).slice(0, 200);
  const lines = files.map((f) => `${f.path} (${f.size}B)`);
  if ((m.files?.length ?? 0) > files.length) {
    lines.push(`… and ${(m.files?.length ?? 0) - files.length} more`);
  }
  return `total_files=${m.total_files ?? 0} total_bytes=${m.total_bytes ?? 0}\n${lines.join('\n')}`;
}
