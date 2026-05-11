import { resolve, join } from 'node:path';
import type { NerdforgeConfig } from '../config/schema.js';

/**
 * All on-disk paths used by nerdforge live behind a single helper so layout
 * changes are a one-line edit and tests can introspect.
 */
export class Paths {
  constructor(
    private readonly cwd: string,
    private readonly cfg: NerdforgeConfig,
  ) {}

  root(): string {
    return resolve(this.cwd, this.cfg.workflow.artifacts_dir);
  }
  resolvedConfig(): string {
    return join(this.root(), 'config.resolved.json');
  }
  state(): string {
    return join(this.root(), 'state.json');
  }
  repoMap(): string {
    return join(this.root(), 'repo-map.json');
  }
  sessionsRoot(): string {
    return join(this.root(), 'sessions');
  }
  session(ts: string): string {
    return join(this.sessionsRoot(), ts);
  }
  blueprintFile(sessionDir: string): string {
    return join(sessionDir, 'blueprint.json');
  }
  symbolAuditFile(sessionDir: string): string {
    return join(sessionDir, 'symbol-audit.json');
  }
  microtasksFile(sessionDir: string): string {
    return join(sessionDir, 'microtasks.json');
  }
  runsRoot(sessionDir: string): string {
    return join(sessionDir, 'runs');
  }
  microtaskRunsDir(sessionDir: string, microtaskId: string): string {
    return join(this.runsRoot(sessionDir), microtaskId);
  }
  attemptDir(sessionDir: string, microtaskId: string, attempt: number): string {
    return join(this.microtaskRunsDir(sessionDir, microtaskId), `attempt-${attempt}`);
  }
}
