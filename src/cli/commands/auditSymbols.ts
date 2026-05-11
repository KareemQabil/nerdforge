import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadContext, makeRouter } from './_shared.js';
import { readJson, writeJson, latestSession } from '../../storage/artifacts.js';
import { generateRepoMap } from '../../repomap/generate.js';
import { SymbolAuditSchema } from '../../schemas/symbolAudit.js';
import { ROUTER_TASKS } from '../../config/tasks.js';
import { buildPrompt, SCHEMA_TAGS } from '../../router/prompt.js';
import { patchState } from '../../storage/state.js';
import { NerdforgeError } from '../../utils/errors.js';
import { log } from '../../utils/logger.js';

export async function cmdAuditSymbols(cwd: string): Promise<void> {
  const ctx = await loadContext(cwd);
  const router = makeRouter(ctx);

  const sessionDir = await latestSession(ctx.paths.sessionsRoot());
  if (!sessionDir) {
    throw new NerdforgeError(
      'No session found. Run `nerdforge blueprint` first.',
      'AUDIT_NO_SESSION',
    );
  }
  const blueprintFile = ctx.paths.blueprintFile(sessionDir);
  if (!existsSync(blueprintFile)) {
    throw new NerdforgeError(
      `Missing blueprint at ${blueprintFile}`,
      'AUDIT_NO_BLUEPRINT',
    );
  }
  const blueprint = await readJson<unknown>(blueprintFile);

  const repoMapFile = ctx.paths.repoMap();
  const repoMap = existsSync(repoMapFile)
    ? await readJson<unknown>(repoMapFile)
    : await generateRepoMap(cwd, ctx.cfg.repo_map);

  const body = [
    `BLUEPRINT:\n${JSON.stringify(blueprint, null, 2)}`,
    `REPO_MAP:\n${JSON.stringify(repoMap, null, 2)}`,
    `REQUIRED_RESPONSE_SHAPE (nerdforge.symbol-audit.v1):`,
    JSON.stringify(
      {
        schema_version: 'nerdforge.symbol-audit.v1',
        verdict: 'PASS|FAIL',
        mismatches: [
          {
            kind: 'file|function|type|route|table|config_key|import|symbol',
            name: '<symbol>',
            expected_location: '<path>',
            found: false,
            notes: '<short>',
          },
        ],
        summary: '<short>',
      },
      null,
      2,
    ),
  ].join('\n\n');

  const prompt = buildPrompt({
    task: ROUTER_TASKS.SYMBOL_AUDIT,
    schemaTag: SCHEMA_TAGS.SYMBOL_AUDIT,
    hardConstraints: [
      'verify only symbols referenced in the blueprint',
      'do not propose code changes',
      'mismatches[].found is the ground truth from the repo map',
    ],
    body,
  });

  log.info(`requesting symbol audit via task ${ROUTER_TASKS.SYMBOL_AUDIT}`);
  const { data } = await router.invokeTask(
    ROUTER_TASKS.SYMBOL_AUDIT,
    prompt,
    SymbolAuditSchema,
  );

  const outFile = join(sessionDir, 'symbol-audit.json');
  await writeJson(outFile, data);
  await patchState(ctx.paths.state(), {
    lastSymbolAuditPath: outFile,
    lastAuditTimestamp: new Date().toISOString(),
  });

  if (data.verdict === 'FAIL') {
    log.err(`symbol audit FAIL — ${data.mismatches?.length ?? 0} mismatch(es)`);
    process.exitCode = 3;
  } else {
    log.ok('symbol audit PASS');
  }
  log.out({ action: 'audit:symbols', file: outFile, verdict: data.verdict });
}
