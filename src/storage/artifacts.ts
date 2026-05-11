import { mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve as pathResolve } from 'node:path';
import { sessionTimestamp } from '../utils/time.js';
import { NerdforgeError } from '../utils/errors.js';

export async function writeJson(file: string, data: unknown): Promise<string> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
  return file;
}

export async function writeText(file: string, data: string): Promise<string> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, data.endsWith('\n') ? data : data + '\n', 'utf8');
  return file;
}

export async function readJson<T = unknown>(file: string): Promise<T> {
  const raw = await readFile(file, 'utf8');
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    throw new NerdforgeError(
      `Invalid JSON at ${file}: ${(e as Error).message}`,
      'ARTIFACT_INVALID_JSON',
    );
  }
}

export function newSessionId(): string {
  return sessionTimestamp();
}

/** Find the most recent session directory; null if none exist. */
export async function latestSession(sessionsRoot: string): Promise<string | null> {
  if (!existsSync(sessionsRoot)) return null;
  const entries = await readdir(sessionsRoot);
  const dirs: { name: string; mtimeMs: number }[] = [];
  for (const name of entries) {
    const p = join(sessionsRoot, name);
    try {
      const s = await stat(p);
      if (s.isDirectory()) dirs.push({ name, mtimeMs: s.mtimeMs });
    } catch {
      /* ignore */
    }
  }
  if (dirs.length === 0) return null;
  dirs.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return pathResolve(sessionsRoot, dirs[0]!.name);
}
