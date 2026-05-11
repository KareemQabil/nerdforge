import fs from 'node:fs';
import path from 'node:path';
import { ARTIFACTS_DIR } from '../types/constants.js';

export interface NerdforgeState {
  currentBlueprintId: string;
  currentSessionId: string;
  lastAuditTimestamp: string;
  pendingMicrotasks: string[];
  completedMicrotasks: string[];
}

const DEFAULT_STATE: NerdforgeState = {
  currentBlueprintId: '',
  currentSessionId: '',
  lastAuditTimestamp: '',
  pendingMicrotasks: [],
  completedMicrotasks: [],
};

/**
 * Manages .nerdforge/state.json — simple JSON file for tracking progress.
 */
export class StateManager {
  private readonly statePath: string;

  constructor(cwd: string) {
    this.statePath = path.join(cwd, ARTIFACTS_DIR, 'state.json');
  }

  load(): NerdforgeState {
    if (!fs.existsSync(this.statePath)) return { ...DEFAULT_STATE };
    try {
      return JSON.parse(fs.readFileSync(this.statePath, 'utf-8')) as NerdforgeState;
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  save(state: NerdforgeState): void {
    const dir = path.dirname(this.statePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  update(partial: Partial<NerdforgeState>): void {
    const current = this.load();
    this.save({ ...current, ...partial });
  }
}
