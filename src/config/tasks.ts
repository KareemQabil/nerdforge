/**
 * Central registry of router task identifiers.
 *
 * These strings MUST match the custom tasks configured on the DigitalOcean
 * Inference Router named `nerdpos`. The router uses semantic matching, so we
 * embed these identifiers into every prompt via a header.
 *
 * Adding a new task requires:
 *   1. Adding the task to the router (DO console)
 *   2. Adding the identifier here
 *   3. Defining a schema for its response in src/schemas/
 */
export const ROUTER_TASKS = {
  ARCHITECTURE_BLUEPRINT: 'enterprise-pos-architecture-blueprint',
  TDD_GATEKEEPER: 'tdd-proof-gatekeeper',
  TARGETED_IMPLEMENTATION: 'unit-test-targeted-implementation',
  SYMBOL_AUDIT: 'repository-symbol-existence-audit',
  HYGIENE_AUDIT: 'maintainability-architecture-hygiene-audit',
} as const;

export type RouterTaskName = (typeof ROUTER_TASKS)[keyof typeof ROUTER_TASKS];

export const ALL_ROUTER_TASKS: readonly RouterTaskName[] = Object.freeze(
  Object.values(ROUTER_TASKS),
);

export function isKnownRouterTask(value: string): value is RouterTaskName {
  return (ALL_ROUTER_TASKS as readonly string[]).includes(value);
}
