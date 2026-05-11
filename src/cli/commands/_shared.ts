import type { NerdforgeConfig } from '../../config/schema.js';
import { Paths } from '../../storage/paths.js';
import { RouterClient } from '../../router/client.js';
import { loadConfig } from '../../config/loader.js';
import { NerdforgeError } from '../../utils/errors.js';

/**
 * Read the resolved config and the DO token from env. Used by every command
 * that talks to the router so each command stays a thin wrapper.
 */
export interface RuntimeContext {
  cwd: string;
  cfg: NerdforgeConfig;
  paths: Paths;
}

export async function loadContext(cwd: string): Promise<RuntimeContext> {
  const cfg = await loadConfig(cwd);
  const paths = new Paths(cwd, cfg);
  return { cwd, cfg, paths };
}

export function requireToken(ctx: RuntimeContext): string {
  const envName = ctx.cfg.auth.do_api_token_env;
  const token = process.env[envName];
  if (!token) {
    throw new NerdforgeError(
      `Environment variable ${envName} is not set. Export your DigitalOcean Model Access Key first.`,
      'AUTH_MISSING_TOKEN',
    );
  }
  return token;
}

export function makeRouter(ctx: RuntimeContext): RouterClient {
  return new RouterClient(ctx.cfg, requireToken(ctx));
}
