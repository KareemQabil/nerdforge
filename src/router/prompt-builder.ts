import { ROUTER_TASKS, type RouterTaskName } from '../types/constants.js';

/**
 * Build a structured prompt that forces the DO Inference Router
 * to route to the correct task via semantic matching.
 *
 * The header is designed to be the FIRST thing the router sees,
 * maximizing semantic match probability with the task description.
 */
export function buildPrompt(
  taskName: RouterTaskName,
  content: string,
  constraints: string[] = [],
  outputSchemaId?: string,
): string {
  const header = [
    `[NERDFORGE_ROUTER_TASK=${taskName}]`,
    outputSchemaId ? `[OUTPUT_SCHEMA=${outputSchemaId}]` : '',
    constraints.length > 0
      ? `[HARD_CONSTRAINTS]\n${constraints.map((c) => `- ${c}`).join('\n')}\n[/HARD_CONSTRAINTS]`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  return `${header}\n\n${content}`;
}

/** Task-specific constraint sets to prevent hallucination and scope creep */
export const TASK_CONSTRAINTS: Record<RouterTaskName, string[]> = {
  [ROUTER_TASKS.ARCHITECTURE_BLUEPRINT]: [
    'Output MUST be valid JSON matching the blueprint schema',
    'NO implementation code — architecture specification only',
    'All entity names must be real, verifiable identifiers',
    'Include microtasks with concrete file paths',
  ],
  [ROUTER_TASKS.TDD_GATEKEEPER]: [
    'Output MUST be valid JSON matching the gatekeeper schema',
    'verdict must be exactly PASS or FAIL',
    'If PASS, commit_message is required',
    'Evaluate ONLY the evidence provided — do not invent passing tests',
  ],
  [ROUTER_TASKS.UNIT_TEST_IMPLEMENTATION]: [
    'Output MUST be valid JSON with a "diff" field containing unified diff',
    'Minimal change only — fix the failing test, nothing else',
    'No refactoring, no new features, no cross-module changes',
    'All symbols referenced must exist in the provided file snippets',
  ],
  [ROUTER_TASKS.SYMBOL_AUDIT]: [
    'Output MUST be valid JSON matching the symbol audit schema',
    'verdict must be exactly PASS or FAIL',
    'Check ONLY symbols that exist in the provided blueprint and repo map',
    'Do not invent files or symbols not in the input',
  ],
  [ROUTER_TASKS.HYGIENE_AUDIT]: [
    'Output MUST be valid JSON matching the hygiene schema',
    'verdict must be exactly PASS, WARN, or FAIL',
    'Findings must reference real files from the provided diff',
    'No speculative recommendations about unseen code',
  ],
};
