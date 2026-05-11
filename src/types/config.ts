import { z } from 'zod';
import { ROUTER_TASKS } from './constants.js';

const routerTaskNames = Object.values(ROUTER_TASKS);

const RouterConfigSchema = z.object({
  name: z.string().default('nerdpos'),
  base_url: z.string().url().default('https://inference.do-ai.run'),
  router_id: z.string().default(''),
  timeout_ms: z.number().int().min(1000).max(300000).default(60000),
});

const AuthConfigSchema = z.object({
  do_api_token_env: z.string().default('DO_MODEL_ACCESS_KEY'),
});

const ModelsConfigSchema = z.object({
  temperature: z.record(z.string(), z.number().min(0).max(2)).default({
    'enterprise-pos-architecture-blueprint': 0.2,
    'tdd-proof-gatekeeper': 0.1,
    'unit-test-targeted-implementation': 0.0,
    'repository-symbol-existence-audit': 0.0,
    'maintainability-architecture-hygiene-audit': 0.1,
  }),
  max_tokens: z.object({
    default: z.number().int().min(100).max(32000).default(4000),
  }).default({}),
});

const WorkflowConfigSchema = z.object({
  branch_prefix: z.string().default('nerdforge/'),
  artifacts_dir: z.string().default('.nerdforge'),
  require_clean_worktree: z.boolean().default(true),
  require_tests_pass: z.boolean().default(true),
  test_command: z.string().default('pnpm test'),
  lint_command: z.string().default('pnpm lint'),
  format_command: z.string().default('pnpm format'),
  allow_parallel_workers: z.boolean().default(false),
  max_worker_attempts: z.number().int().min(1).max(10).default(3),
  max_router_retries: z.number().int().min(0).max(5).default(2),
});

const RepoMapConfigSchema = z.object({
  include: z.array(z.string()).default(['src/**', 'test/**', 'package.json']),
  exclude: z.array(z.string()).default(['node_modules/**', 'dist/**', '.git/**']),
  preview_lines: z.number().int().min(0).max(50).default(0),
});

export const NerdforgeConfigSchema = z.object({
  router: RouterConfigSchema.default({}),
  auth: AuthConfigSchema.default({}),
  models: ModelsConfigSchema.default({}),
  workflow: WorkflowConfigSchema.default({}),
  repo_map: RepoMapConfigSchema.default({}),
  env: z.record(z.string(), z.string()).default({}),
});

export type NerdforgeConfig = z.infer<typeof NerdforgeConfigSchema>;
