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
    return status.isClean();
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
