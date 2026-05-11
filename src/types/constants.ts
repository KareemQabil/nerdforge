/**
 * Central registry of all router task names.
 * Adding a new task = modify ONLY this file.
 * These names MUST match the DO Inference Router task names exactly.
 */
export const ROUTER_TASKS = {
  ARCHITECTURE_BLUEPRINT: 'enterprise-pos-architecture-blueprint',
  TDD_GATEKEEPER: 'tdd-proof-gatekeeper',
  UNIT_TEST_IMPLEMENTATION: 'unit-test-targeted-implementation',
  SYMBOL_AUDIT: 'repository-symbol-existence-audit',
  HYGIENE_AUDIT: 'maintainability-architecture-hygiene-audit',
} as const;

export type RouterTaskName = (typeof ROUTER_TASKS)[keyof typeof ROUTER_TASKS];

/** DO Inference Router API constants */
export const ROUTER_API = {
  BASE_URL: 'https://inference.do-ai.run',
  CHAT_ENDPOINT: '/v1/chat/completions',
  MODEL: 'router:nerdpos',
  ROUTE_HEADER: 'x-model-router-selected-route',
  AFFINITY_HEADER: 'X-Model-Affinity',
} as const;

/** Auth env var names in precedence order */
export const AUTH_ENV_VARS = [
  'DO_MODEL_ACCESS_KEY',
  'DIGITALOCEAN_TOKEN',
  'DO_API_KEY',
] as const;

export const ARTIFACTS_DIR = '.nerdforge';
