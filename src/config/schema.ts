import { z } from 'zod';
import { ALL_ROUTER_TASKS } from './tasks.js';

/**
 * Zod schema for the on-disk `nerdforge.yaml` file. Fails fast on missing/invalid
 * config so callers never inherit a half-initialised state.
 */

const TaskTemperatureMap = z
  .object(
    Object.fromEntries(
      ALL_ROUTER_TASKS.map((t) => [t, z.number().min(0).max(2).optional()]),
    ),
  )
  .partial();

export const RouterConfigSchema = z.object({
  name: z.string().min(1).default('nerdpos'),
  base_url: z.string().url().default('https://inference.do-ai.run'),
  model: z.string().min(1).default('router:nerdpos'),
  router_id: z.string().default(''),
  timeout_ms: z.number().int().positive().default(60_000),
});

export const AuthConfigSchema = z.object({
  do_api_token_env: z.string().min(1).default('DIGITALOCEAN_TOKEN'),
});

export const ModelsConfigSchema = z.object({
  temperature: TaskTemperatureMap.default({}),
  max_tokens: z
    .object({ default: z.number().int().positive().default(4000) })
    .default({ default: 4000 }),
});

export const WorkflowConfigSchema = z.object({
  branch_prefix: z.string().min(1).default('nerdforge/'),
  artifacts_dir: z.string().min(1).default('.nerdforge'),
  require_clean_worktree: z.boolean().default(true),
  require_tests_pass: z.boolean().default(true),
  test_command: z.string().min(1).default('yarn test'),
  lint_command: z.string().default(''),
  format_command: z.string().default(''),
  allow_parallel_workers: z.boolean().default(false),
  max_worker_attempts: z.number().int().min(1).max(10).default(3),
  max_router_retries: z.number().int().min(0).max(10).default(2),
});

export const RepoMapConfigSchema = z.object({
  include: z.array(z.string()).default(['src/**', 'test/**']),
  exclude: z.array(z.string()).default(['node_modules/**', 'dist/**', '.git/**']),
  preview_chars: z.number().int().min(0).max(10_000).default(0),
});

export const NerdforgeConfigSchema = z.object({
  router: RouterConfigSchema.default({} as never),
  auth: AuthConfigSchema.default({} as never),
  models: ModelsConfigSchema.default({} as never),
  workflow: WorkflowConfigSchema.default({} as never),
  repo_map: RepoMapConfigSchema.default({} as never),
});

export type RouterConfig = z.infer<typeof RouterConfigSchema>;
export type AuthConfig = z.infer<typeof AuthConfigSchema>;
export type ModelsConfig = z.infer<typeof ModelsConfigSchema>;
export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;
export type RepoMapConfig = z.infer<typeof RepoMapConfigSchema>;
export type NerdforgeConfig = z.infer<typeof NerdforgeConfigSchema>;
