import { RouterError, type RouterClient } from '../router/client.js';
import { ROUTER_TASKS } from '../types/constants.js';
import {
  SymbolAuditSchema,
  type Blueprint,
  type SymbolAudit,
  type SymbolAuditMismatch,
} from '../types/schemas.js';
import type { RepoMap } from '../types/repomap.js';

const FUTURE_SYMBOL_KINDS = new Set([
  'symbol',
  'entity',
  'class',
  'function',
  'module',
  'type',
  'interface',
  'service',
  'component',
  'state',
]);

export interface SymbolAuditAnalysis {
  advisory: SymbolAuditMismatch[];
  blocking: SymbolAuditMismatch[];
}

export interface SymbolAuditRunResult {
  analysis: SymbolAuditAnalysis;
  audit: SymbolAudit;
  diagnostics?: {
    error: string;
    rawResponse?: string;
  };
  effectiveVerdict: 'PASS' | 'FAIL';
  mode: 'router' | 'fallback';
}

function normalizePath(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

function isInvalidRepoRelativePath(value: string): boolean {
  const normalized = normalizePath(value);
  if (!normalized) {
    return true;
  }
  if (normalized.startsWith('/')) {
    return true;
  }
  if (/^[A-Za-z]:\//.test(normalized)) {
    return true;
  }
  return normalized.split('/').includes('..');
}

function collectPlannedPaths(blueprint: Blueprint): Set<string> {
  const planned = new Set<string>();

  for (const microtask of blueprint.microtasks) {
    for (const file of microtask.expected_files) {
      planned.add(normalizePath(file));
    }
    for (const file of microtask.tests.new) {
      planned.add(normalizePath(file));
    }
  }

  return planned;
}

function buildRepoPathSet(repoMap: RepoMap): Set<string> {
  return new Set(repoMap.files.map((file) => normalizePath(file.path)));
}

export function buildSymbolAuditPrompt(blueprint: Blueprint, repoMap: RepoMap): string {
  return [
    'BLUEPRINT:',
    JSON.stringify(blueprint, null, 2),
    '',
    'REPOSITORY FILES:',
    repoMap.files.map((file) => file.path).join('\n'),
  ].join('\n');
}

export function analyzeSymbolAudit(
  blueprint: Blueprint,
  audit: SymbolAudit,
): SymbolAuditAnalysis {
  const plannedPaths = collectPlannedPaths(blueprint);
  const advisory: SymbolAuditMismatch[] = [];
  const blocking: SymbolAuditMismatch[] = [];

  for (const mismatch of audit.mismatches) {
    const kind = mismatch.kind.toLowerCase();
    const expectedLocation = normalizePath(mismatch.expected_location);
    const mismatchName = normalizePath(mismatch.name);
    const pointsToPlannedPath =
      plannedPaths.has(expectedLocation) || plannedPaths.has(mismatchName);

    if (kind === 'invalid_path' || kind === 'missing_modified_test' || kind === 'duplicate_microtask_id') {
      blocking.push(mismatch);
      continue;
    }

    if (!mismatch.found && pointsToPlannedPath) {
      advisory.push(mismatch);
      continue;
    }

    if (!mismatch.found && FUTURE_SYMBOL_KINDS.has(kind)) {
      advisory.push(mismatch);
      continue;
    }

    blocking.push(mismatch);
  }

  return { advisory, blocking };
}

export function createLocalSymbolAudit(
  blueprint: Blueprint,
  repoMap: RepoMap,
  diagnosticsReason?: string,
): SymbolAudit {
  const repoPaths = buildRepoPathSet(repoMap);
  const mismatches: SymbolAuditMismatch[] = [];
  const seenIds = new Set<string>();

  for (const microtask of blueprint.microtasks) {
    if (seenIds.has(microtask.id)) {
      mismatches.push({
        kind: 'duplicate_microtask_id',
        name: microtask.id,
        expected_location: microtask.id,
        found: true,
        notes: 'Microtask identifiers must be unique.',
      });
    }
    seenIds.add(microtask.id);

    for (const file of microtask.expected_files) {
      if (isInvalidRepoRelativePath(file)) {
        mismatches.push({
          kind: 'invalid_path',
          name: file || microtask.id,
          expected_location: file || 'unknown',
          found: false,
          notes: `Invalid repo-relative path referenced by ${microtask.id}.`,
        });
      }
    }

    for (const file of microtask.tests.new) {
      if (isInvalidRepoRelativePath(file)) {
        mismatches.push({
          kind: 'invalid_path',
          name: file || microtask.id,
          expected_location: file || 'unknown',
          found: false,
          notes: `Invalid new test path referenced by ${microtask.id}.`,
        });
      }
    }

    for (const file of microtask.tests.modified) {
      const normalized = normalizePath(file);
      if (isInvalidRepoRelativePath(file)) {
        mismatches.push({
          kind: 'invalid_path',
          name: file || microtask.id,
          expected_location: file || 'unknown',
          found: false,
          notes: `Invalid modified test path referenced by ${microtask.id}.`,
        });
        continue;
      }

      if (!repoPaths.has(normalized)) {
        mismatches.push({
          kind: 'missing_modified_test',
          name: file,
          expected_location: file,
          found: false,
          notes: `tests.modified should reference an existing file. ${diagnosticsReason ?? ''}`.trim(),
        });
      }
    }
  }

  return {
    verdict: mismatches.length === 0 ? 'PASS' : 'FAIL',
    mismatches,
  };
}

export async function runSymbolAudit(params: {
  blueprint: Blueprint;
  client: Pick<RouterClient, 'invokeTask'>;
  repoMap: RepoMap;
}): Promise<SymbolAuditRunResult> {
  try {
    const result = await params.client.invokeTask(
      ROUTER_TASKS.SYMBOL_AUDIT,
      buildSymbolAuditPrompt(params.blueprint, params.repoMap),
      SymbolAuditSchema,
      { schemaId: 'nerdforge.symbolaudit.v1' },
    );
    const analysis = analyzeSymbolAudit(params.blueprint, result.data);

    return {
      audit: result.data,
      analysis,
      effectiveVerdict: analysis.blocking.length > 0 ? 'FAIL' : 'PASS',
      mode: 'router',
    };
  } catch (error: unknown) {
    const diagnostics = error instanceof RouterError
      ? {
          error: error.message,
          rawResponse: error.lastRawResponse,
        }
      : {
          error: error instanceof Error ? error.message : String(error),
        };
    const audit = createLocalSymbolAudit(params.blueprint, params.repoMap, diagnostics.error);
    const analysis = analyzeSymbolAudit(params.blueprint, audit);

    return {
      audit,
      analysis,
      diagnostics,
      effectiveVerdict: analysis.blocking.length > 0 ? 'FAIL' : 'PASS',
      mode: 'fallback',
    };
  }
}
