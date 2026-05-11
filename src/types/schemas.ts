import { z } from 'zod';

function pickString(
  record: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function stringifyUnknown(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function normalizeSymbolMismatchInput(value: unknown): unknown {
  if (typeof value === 'string') {
    return {
      kind: 'symbol',
      name: value,
      expected_location: 'unknown',
      found: false,
      notes: value,
    };
  }

  if (!value || typeof value !== 'object') {
    const fallback = stringifyUnknown(value) ?? 'unknown';
    return {
      kind: 'symbol',
      name: fallback,
      expected_location: 'unknown',
      found: false,
      notes: fallback === 'unknown' ? undefined : fallback,
    };
  }

  const record = value as Record<string, unknown>;
  const name = pickString(record, [
    'name',
    'symbol',
    'entity',
    'reference',
    'identifier',
    'id',
    'file',
    'path',
    'target',
    'title',
  ]) ?? 'unknown';
  const expectedLocation = pickString(record, [
    'expected_location',
    'expectedLocation',
    'location',
    'expected',
    'file',
    'path',
    'module',
    'source',
  ]) ?? 'unknown';
  const kind = pickString(record, [
    'kind',
    'type',
    'category',
    'issue',
    'reason',
  ]) ?? (expectedLocation.includes('/') ? 'file' : 'symbol');
  const foundValue = record.found ?? record.exists ?? record.present;
  const found = typeof foundValue === 'boolean'
    ? foundValue
    : false;
  const notes = pickString(record, [
    'notes',
    'note',
    'message',
    'description',
    'details',
  ]) ?? stringifyUnknown(record.reason);

  return {
    kind,
    name,
    expected_location: expectedLocation,
    found,
    notes,
  };
}

function normalizeHygieneFindingInput(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    const fallback = stringifyUnknown(value) ?? 'Unknown hygiene finding';
    return {
      severity: 'LOW',
      rule_id: 'general',
      file: 'unknown',
      description: fallback,
    };
  }

  const record = value as Record<string, unknown>;
  const severityRaw = pickString(record, ['severity', 'level', 'priority']);
  const severityNormalized = severityRaw ? severityRaw.toUpperCase() : '';
  let severity: 'LOW' | 'MED' | 'HIGH' = 'LOW';
  if (['WARN', 'WARNING', 'MED', 'MEDIUM'].includes(severityNormalized)) {
    severity = 'MED';
  } else if (['HIGH', 'ERROR', 'CRITICAL'].includes(severityNormalized)) {
    severity = 'HIGH';
  }

  const ruleId = pickString(record, ['rule_id', 'rule', 'id', 'code']) ?? 'general';
  const description = pickString(record, [
    'description',
    'message',
    'summary',
    'detail',
    'details',
    'notes',
  ]) ?? stringifyUnknown(record.message) ?? 'No description provided.';
  const file = pickString(record, ['file', 'path', 'location']) ?? 'unknown';
  const recommendation = pickString(record, ['recommendation', 'fix', 'remediation', 'action']);

  return {
    severity,
    rule_id: ruleId,
    file,
    description,
    recommendation,
  };
}

const MicrotaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  expected_files: z.array(z.string()).default([]),
  tests: z.object({
    new: z.array(z.string()).default([]),
    modified: z.array(z.string()).default([]),
  }).default({ new: [], modified: [] }),
  acceptance_criteria: z.array(z.string()).default([]),
  tracing_proof_requirements: z.array(z.string()).default([]),
});

export const BlueprintSchema = z.object({
  system_name: z.string().default('System'),
  domain_modules: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    entities: z.array(z.string()).default([]),
  })).default([]),
  database: z.object({
    entities: z.array(z.object({
      name: z.string(),
      fields: z.array(z.string()).default([]),
      relationships: z.array(z.string()).default([]),
    })).default([]),
  }).default({ entities: [] }),
  invariants: z.array(z.string()).default([]),
  microtasks: z.array(MicrotaskSchema).default([]),
});

export type Blueprint = z.output<typeof BlueprintSchema>;
export type Microtask = z.output<typeof MicrotaskSchema>;

export const SymbolAuditMismatchSchema = z.preprocess(
  normalizeSymbolMismatchInput,
  z.object({
    kind: z.string().default('symbol'),
    name: z.string().default('unknown'),
    expected_location: z.string().default('unknown'),
    found: z.boolean().default(false),
    notes: z.string().optional(),
  }),
);

export const SymbolAuditSchema = z.object({
  verdict: z.enum(['PASS', 'FAIL']),
  mismatches: z.array(SymbolAuditMismatchSchema).default([]),
});

export type SymbolAudit = z.output<typeof SymbolAuditSchema>;
export type SymbolAuditMismatch = z.output<typeof SymbolAuditMismatchSchema>;

export const PatchSchema = z.object({
  diff: z.string().min(1),
  files_changed: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).optional(),
});

export type Patch = z.output<typeof PatchSchema>;

export const HygieneFindingSchema = z.preprocess(
  normalizeHygieneFindingInput,
  z.object({
    severity: z.enum(['LOW', 'MED', 'HIGH']).default('LOW'),
    rule_id: z.string().default('general'),
    file: z.string().default('unknown'),
    description: z.string().default('No description provided.'),
    recommendation: z.string().optional(),
  }),
);

export const HygieneSchema = z.object({
  verdict: z.enum(['PASS', 'WARN', 'FAIL']),
  findings: z.array(HygieneFindingSchema).default([]),
});

export type HygieneReport = z.output<typeof HygieneSchema>;

export const GatekeeperSchema = z.object({
  verdict: z.enum(['PASS', 'FAIL']),
  reasons: z.array(z.string()).default([]),
  required_changes: z.array(z.string()).default([]),
  commit_message: z.string().optional(),
  evidence_checklist: z.array(z.string()).default([]),
});

export type GatekeeperVerdict = z.output<typeof GatekeeperSchema>;

export const RESPONSE_SCHEMAS = {
  'enterprise-pos-architecture-blueprint': BlueprintSchema,
  'tdd-proof-gatekeeper': GatekeeperSchema,
  'unit-test-targeted-implementation': PatchSchema,
  'repository-symbol-existence-audit': SymbolAuditSchema,
  'maintainability-architecture-hygiene-audit': HygieneSchema,
} as const;
