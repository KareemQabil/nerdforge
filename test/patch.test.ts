import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { GitOps } from '../src/git/ops.js';

async function newRepo(): Promise<{ dir: string; git: GitOps }> {
  const dir = mkdtempSync(join(tmpdir(), 'nerdforge-git-'));
  const git = simpleGit({ baseDir: dir });
  await git.init();
  await git.addConfig('user.email', 'nerdforge@test.local');
  await git.addConfig('user.name', 'nerdforge test');
  await git.addConfig('commit.gpgsign', 'false');
  // initial commit
  writeFileSync(join(dir, 'hello.txt'), 'hello\n');
  await git.add('.');
  await git.commit('init');
  return { dir, git: new GitOps(dir) };
}

describe('GitOps.applyPatch', () => {
  it('applies a unified diff that modifies an existing file', async () => {
    const { dir, git } = await newRepo();
    const diff =
      `diff --git a/hello.txt b/hello.txt\n` +
      `--- a/hello.txt\n` +
      `+++ b/hello.txt\n` +
      `@@ -1 +1 @@\n` +
      `-hello\n` +
      `+goodbye\n`;
    await git.applyPatch(diff, join(dir, '.nerdforge', 'scratch'));
    // After git apply --3way the file content is updated; verify directly.
    const content = readFileSync(join(dir, 'hello.txt'), 'utf8');
    expect(content).toBe('goodbye\n');
    rmSync(dir, { recursive: true });
  });

  it('throws GIT_APPLY_FAILED on a malformed patch', async () => {
    const { dir, git } = await newRepo();
    await expect(
      git.applyPatch('not a real diff', join(dir, '.nerdforge', 'scratch')),
    ).rejects.toMatchObject({ code: 'GIT_APPLY_FAILED' });
    rmSync(dir, { recursive: true });
  });

  it('atomicCommit refuses empty staged set', async () => {
    const { dir, git } = await newRepo();
    await expect(git.atomicCommit('noop')).rejects.toMatchObject({
      code: 'GIT_EMPTY_COMMIT',
    });
    rmSync(dir, { recursive: true });
  });

  it('atomicCommit succeeds with staged changes and returns SHA', async () => {
    const { dir, git } = await newRepo();
    writeFileSync(join(dir, 'new.txt'), 'x\n');
    const sha = await git.atomicCommit('add new');
    expect(sha).toMatch(/^[0-9a-f]{7,}$/);
    rmSync(dir, { recursive: true });
  });

  it('hardResetToHead clears working-tree changes', async () => {
    const { dir, git } = await newRepo();
    writeFileSync(join(dir, 'hello.txt'), 'changed\n');
    expect(await git.isClean()).toBe(false);
    await git.hardResetToHead();
    expect(await git.isClean()).toBe(true);
    rmSync(dir, { recursive: true });
  });
});
