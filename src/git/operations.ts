import { simpleGit, type SimpleGit } from 'simple-git';

/**
 * Safe git operations wrapper.
 * NEVER force pushes. NEVER modifies history.
 */
export class GitOperations {
  private git: SimpleGit;

  constructor(cwd: string) {
    this.git = simpleGit(cwd);
  }

  async isCleanWorktree(): Promise<boolean> {
    const status = await this.git.status();
    const hasTrackedChanges = status.files.some(
      (file) => file.working_dir !== '?' || file.index !== '?',
    );
    return !hasTrackedChanges;
  }

  async getCurrentBranch(): Promise<string> {
    const branch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
    return branch.trim();
  }

  async createBranch(name: string): Promise<void> {
    await this.git.checkoutLocalBranch(name);
  }

  async branchExists(name: string): Promise<boolean> {
    const branches = await this.git.branchLocal();
    return branches.all.includes(name);
  }

  async checkoutBranch(name: string): Promise<void> {
    await this.git.checkout(name);
  }

  /** Stage specific files and commit with message */
  async commitAtomic(message: string, files: string[]): Promise<string> {
    await this.git.add(files);
    const result = await this.git.commit(message);
    return result.commit;
  }

  /** Stage all changes and commit */
  async commitAll(message: string): Promise<string> {
    await this.git.add('.');
    const result = await this.git.commit(message);
    return result.commit;
  }

  /** Amend the previous commit */
  async commitAmend(message?: string): Promise<string> {
    await this.git.add('.');
    const args = ['--amend'];
    if (message) {
      args.push('-m', message);
    } else {
      args.push('--no-edit');
    }
    const result = await this.git.commit(args);
    return result.commit;
  }

  /** Stash current changes and checkout a branch */
  async stashAndCheckout(branchName: string): Promise<void> {
    await this.git.stash();
    await this.git.checkout(branchName);
  }

  /** Reset hard to HEAD */
  async resetHard(): Promise<void> {
    await this.git.reset(['--hard', 'HEAD']);
  }

  async getLastCommitHash(): Promise<string> {
    const log = await this.git.log({ maxCount: 1 });
    return log.latest?.hash ?? '';
  }

  async getDiff(): Promise<string> {
    return await this.git.diff();
  }

  async getDiffStaged(): Promise<string> {
    return await this.git.diff(['--staged']);
  }
}
