import { execa } from 'execa';

/**
 * Apply a unified diff patch to the working tree.
 * Uses `git apply` for safe 3-way merge.
 */
export async function applyPatch(
  diff: string,
  cwd: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Write patch to temp file in .nerdforge to avoid polluting the repo
    const fs = await import('node:fs');
    const path = await import('node:path');
    const patchPath = path.join(cwd, '.nerdforge', '_temp.patch');
    fs.writeFileSync(patchPath, diff, 'utf-8');

    await execa('git', ['apply', '--3way', patchPath], { cwd });

    // Clean up
    fs.unlinkSync(patchPath);
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}
