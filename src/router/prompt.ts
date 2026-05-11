import { ROUTER_TASKS, type RouterTaskName } from '../config/tasks.js';

/**
 * Prompt header injection.
 *
 * The DigitalOcean Inference Router uses semantic matching to route a single
 * `router:nerdpos` model id to one of several custom tasks. To force a
 * deterministic routing decision we prepend a machine-parseable header that
 * names the target task and the output schema explicitly.
 *
 * Every call site MUST go through this builder; freeform prompts are forbidden.
 */

export interface BuildPromptInput {
  readonly task: RouterTaskName;
  readonly schemaTag: string;
  readonly hardConstraints: readonly string[];
  readonly body: string;
}

export const SCHEMA_TAGS = {
  BLUEPRINT: 'nerdforge.blueprint.v1',
  SYMBOL_AUDIT: 'nerdforge.symbol-audit.v1',
  PATCH: 'nerdforge.patch.v1',
  HYGIENE: 'nerdforge.hygiene.v1',
  GATEKEEPER: 'nerdforge.gatekeeper.v1',
  MICROTASKS: 'nerdforge.microtasks.v1',
} as const;

/** Universal anti-prose constraints embedded in every prompt. */
export const UNIVERSAL_CONSTRAINTS: readonly string[] = Object.freeze([
  'respond with exactly one JSON object',
  'no markdown fences, no prose, no explanations outside JSON',
  'all required schema fields must be present',
  'use null instead of omitting optional fields when uncertain',
]);

export function buildPrompt(input: BuildPromptInput): string {
  if (!Object.values(ROUTER_TASKS).includes(input.task)) {
    throw new Error(`Unknown router task: ${input.task}`);
  }
  const allConstraints = [...UNIVERSAL_CONSTRAINTS, ...input.hardConstraints];
  const header = [
    `[NERDFORGE_ROUTER_TASK=${input.task}]`,
    `[OUTPUT_SCHEMA=${input.schemaTag}]`,
    `[HARD_CONSTRAINTS]`,
    ...allConstraints.map((c) => `- ${c}`),
    `[/HARD_CONSTRAINTS]`,
  ].join('\n');
  return `${header}\n\n${input.body.trim()}\n`;
}

/**
 * System frame complementing the user header so that even if the router
 * normalises the user message, routing intent survives in the system role.
 */
export function buildSystemMessage(task: RouterTaskName): string {
  return [
    'You are a deterministic specialist agent inside the nerdforge orchestrator.',
    `Target task: ${task}.`,
    'You MUST respond with exactly one JSON object that matches the requested schema.',
    'Do not include markdown fences, commentary, or fields outside the schema.',
    'If the request is under-specified, respond with `{ "error": "<reason>" }`.',
  ].join(' ');
}
