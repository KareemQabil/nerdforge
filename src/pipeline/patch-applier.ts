import fs from 'node:fs';
import path from 'node:path';
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
    if (isStructuredPatch(diff)) {
      applyStructuredPatch(diff, cwd);
      return { success: true };
    }

    // Write patch to temp file in .nerdforge to avoid polluting the repo
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

function isStructuredPatch(diff: string): boolean {
  return diff.includes('*** Begin Patch') && diff.includes('*** End Patch');
}

function applyStructuredPatch(diff: string, cwd: string): void {
  const lines = diff.split(/\r?\n/);
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.startsWith('*** Begin Patch') || line.startsWith('*** End Patch')) {
      index += 1;
      continue;
    }

    if (line.startsWith('*** Add File:')) {
      const filePath = line.replace('*** Add File:', '').trim();
      const { content, nextIndex } = collectPatchBlock(lines, index + 1);
      const resolvedPath = resolvePatchPath(cwd, filePath);
      ensureParentDir(resolvedPath);
      fs.writeFileSync(resolvedPath, content, 'utf-8');
      index = nextIndex;
      continue;
    }

    if (line.startsWith('*** Delete File:')) {
      const filePath = line.replace('*** Delete File:', '').trim();
      const resolvedPath = resolvePatchPath(cwd, filePath);
      if (fs.existsSync(resolvedPath)) {
        fs.unlinkSync(resolvedPath);
      }
      index += 1;
      continue;
    }

    if (line.startsWith('*** Update File:')) {
      const filePath = line.replace('*** Update File:', '').trim();
      const { contentLines, nextIndex } = collectPatchBlock(lines, index + 1, true);
      const resolvedPath = resolvePatchPath(cwd, filePath);
      let original = '';
      if (fs.existsSync(resolvedPath)) {
        original = fs.readFileSync(resolvedPath, 'utf-8');
      } else {
        ensureParentDir(resolvedPath);
      }
      const updated = applyUpdateHunks(original, contentLines);
      fs.writeFileSync(resolvedPath, updated, 'utf-8');
      index = nextIndex;
      continue;
    }

    index += 1;
  }
}

function collectPatchBlock(
  lines: string[],
  startIndex: number,
  keepPrefixes = false,
): { content: string; contentLines: string[]; nextIndex: number } {
  const collected: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (line.startsWith('*** ')) {
      break;
    }
    if (keepPrefixes) {
      collected.push(line);
    } else if (line.startsWith('+')) {
      collected.push(line.slice(1));
    } else {
      collected.push(line);
    }
    index += 1;
  }

  return {
    content: collected.join('\n'),
    contentLines: collected,
    nextIndex: index,
  };
}

function applyUpdateHunks(original: string, lines: string[]): string {
  let output = original;
  let oldLines: string[] = [];
  let newLines: string[] = [];

  const applyHunk = () => {
    if (oldLines.length === 0 && newLines.length === 0) {
      return;
    }
    const oldBlock = oldLines.join('\n');
    const newBlock = newLines.join('\n');
    const index = output.indexOf(oldBlock);
    if (index === -1) {
      throw new Error('Structured patch update failed to match the target content.');
    }
    output = `${output.slice(0, index)}${newBlock}${output.slice(index + oldBlock.length)}`;
    oldLines = [];
    newLines = [];
  };

  for (const line of lines) {
    if (line.startsWith('@@')) {
      applyHunk();
      continue;
    }
    if (line.startsWith('-')) {
      oldLines.push(line.slice(1));
      continue;
    }
    if (line.startsWith('+')) {
      newLines.push(line.slice(1));
      continue;
    }
    if (line.startsWith(' ')) {
      const content = line.slice(1);
      oldLines.push(content);
      newLines.push(content);
      continue;
    }
    oldLines.push(line);
    newLines.push(line);
  }

  applyHunk();
  return output;
}

function resolvePatchPath(cwd: string, filePath: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.join(cwd, filePath);
}

function ensureParentDir(filePath: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}
