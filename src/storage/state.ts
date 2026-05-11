import { existsSync } from 'node:fs';
import { z } from 'zod';
import { readJson, writeJson } from './artifacts.js';

/**
 * `.nerdforge/state.json` — slim, append-light state file used by `status`.
 * Each command updates only the fields it owns; we never delete keys.
 */
export const StateSchema = z.object({
  schema_version: z.literal('nerdforge.state.v1').default('nerdforge.state.v1'),
  currentSessionId: z.string().nullable().default(null),
  currentBranch: z.string().nullable().default(null),
  lastBlueprintPath: z.string().nullable().default(null),
  lastSymbolAuditPath: z.string().nullable().default(null),
  lastMicrotasksPath: z.string().nullable().default(null),
  lastAuditTimestamp: z.string().nullable().default(null),
  microtasks: z
    .record(
      z.string(),
      z.object({
        status: z.enum(['pending', 'in_progress', 'passed', 'failed']),
        lastAttempt: z.number().int().nonnegative().default(0),
        lastUpdated: z.string(),
        lastCommitSha: z.string().nullable().default(null),
      }),
    )
    .default({}),
});

export type State = z.infer<typeof StateSchema>;

const EMPTY_STATE: State = StateSchema.parse({});

export async function readState(file: string): Promise<State> {
  if (!existsSync(file)) return structuredClone(EMPTY_STATE);
  const raw = await readJson<unknown>(file);
  const parsed = StateSchema.safeParse(raw);
  return parsed.success ? parsed.data : structuredClone(EMPTY_STATE);
}

export async function writeState(file: string, state: State): Promise<string> {
  return writeJson(file, state);
}

export async function patchState(
  file: string,
  patch: Partial<State>,
): Promise<State> {
  const current = await readState(file);
  const next = { ...current, ...patch } as State;
  await writeState(file, next);
  return next;
}
