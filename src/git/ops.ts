import { simpleGit, type SimpleGit } from 'simple-git';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NerdforgeError } from '../utils/errors.js';

/**
 * Thin facade over simple-git enforcing nerdforge's safety policies:
 *   - never force-push
 *   - operate only on branches we created
 *   - patch apply is 3-way and refuses on failure (no auto-merge of conflicts)
 *   - commits are atomic (one microtask = one commit)
 */
export class GitOps {
  private readonly git: SimpleGit;

  constructor(public readonly cwd: string) {
    this.git = simpleGit({ baseDir: cwd });
  }

  async isRepo(): Promise<boolean> {
    try {
      return await this.git.checkIsRepo();
    } catch {
      return false;
    }
  }

  async assertRepo(): Promise<void> {
    if (!(await this.isRepo())) {
      throw new NerdforgeError(
        `${this.cwd} is not a git repository. Run \`git init\` first.`,
        'GIT_NOT_A_REPO',
      );
    }
  }

  async isClean(): Promise<boolean> {
    const s = await this.git.status();
    return s.isClean();
  }

  async currentBranch(): Promise<string> {
    return (await this.git.branch()).current;
  }

  async createBranch(name: string): Promise<void> {
    const branches = await this.git.branch();
    if (branches.all.includes(name)) {
      await this.git.checkout(name);
      return;
    }
    await this.git.checkoutLocalBranch(name);
  }

  async stageAll(): Promise<void> {
    await this.git.add(['-A']);
  }

  async stagedDiff(): Promise<string> {
    return this.git.diff(['--cached']);
  }

  async workingDiff(): Promise<string> {
    return this.git.diff();
  }

  async commit(message: string): Promise<string> {
    const r = await this.git.commit(message);
    return r.commit;
  }

  /** Hard reset working tree + index back to HEAD (used between retries). */
  async hardResetToHead(): Promise<void> {
    await this.git.raw(['reset', '--hard', 'HEAD']);
  }

  /**
   * Apply a unified diff to the working tree using `git apply --3way`.
   * On failure makes a best-effort second pass with `--reject` so .rej files
   * remain for diagnosis, then throws.
   */
  async applyPatch(diff: string, scratchDir: string): Promise<string> {
    await mkdir(scratchDir, { recursive: true });
    const patchFile = join(scratchDir, 'apply.patch');
    await writeFile(patchFile, ensureTrailingNewline(diff), 'utf8');
    try {
      await this.git.raw(['apply', '--3way', '--whitespace=nowarn', patchFile]);
      return patchFile;
    } catch (e1) {
      try {
        await this.git.raw(['apply', '--reject', '--whitespace=nowarn', patchFile]);
      } catch {
        /* ignore */
      }
      throw new NerdforgeError(
        `git apply failed: ${(e1 as Error).message}`,
        'GIT_APPLY_FAILED',
        { patchFile },
      );
    }
  }

  /** Stage + commit all current changes; asserts non-empty staged diff. */
  async atomicCommit(message: string): Promise<string> {
    await this.stageAll();
    const staged = await this.stagedDiff();
    if (!staged.trim()) {
      throw new NerdforgeError(
        'Refusing to create empty commit: no staged changes',
        'GIT_EMPTY_COMMIT',
      );
    }
    return this.commit(message);
  }
}

function ensureTrailingNewline(s: string): string {
  return s.endsWith('\n') ? s : s + '\n';
}
