import fs from 'node:fs';
import path from 'node:path';
import { ARTIFACTS_DIR } from '../types/constants.js';

/**
 * Manages session directories under .nerdforge/sessions/<timestamp>/
 * Each session stores artifacts from a single workflow run.
 */
export class SessionManager {
  private readonly sessionsDir: string;

  constructor(private readonly cwd: string) {
    this.sessionsDir = path.join(cwd, ARTIFACTS_DIR, 'sessions');
  }

  /** Create a new session and return its ID (timestamp) */
  createSession(): string {
    const id = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = path.join(this.sessionsDir, id);
    fs.mkdirSync(dir, { recursive: true });
    return id;
  }

  /** Get the most recent session ID */
  getLatestSessionId(): string | null {
    if (!fs.existsSync(this.sessionsDir)) return null;
    const entries = fs.readdirSync(this.sessionsDir).sort().reverse();
    return entries[0] ?? null;
  }

  /** Get path to session directory */
  getSessionDir(sessionId: string): string {
    return path.join(this.sessionsDir, sessionId);
  }

  /** Save an artifact to a session */
  saveArtifact(sessionId: string, filename: string, data: unknown): string {
    const dir = this.getSessionDir(sessionId);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return filePath;
  }

  /** Load an artifact from a session */
  loadArtifact<T>(sessionId: string, filename: string): T | null {
    const filePath = path.join(this.getSessionDir(sessionId), filename);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  }

  /** Save a run artifact (attempt-level) */
  saveRunArtifact(
    sessionId: string,
    microtaskId: string,
    attempt: number,
    filename: string,
    data: unknown,
  ): string {
    const dir = path.join(
      this.getSessionDir(sessionId),
      'runs',
      microtaskId,
      `attempt-${attempt}`,
    );
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }
}
