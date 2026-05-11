import { z } from 'zod';

// ── Blueprint ────────────────────────────────────────────────

const MicrotaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  expected_files: z.array(z.string()),
  tests: z.object({
    new: z.array(z.string()),
    modified: z.array(z.string()),
  }),
  acceptance_criteria: z.array(z.string()),
  tracing_proof_requirements: z.array(z.string()),
});

export const BlueprintSchema = z.object({
  system_name: z.string(),
  domain_modules: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    entities: z.array(z.string()),
  })),
  database: z.object({
    entities: z.array(z.object({
      name: z.string(),
      fields: z.array(z.string()),
      relationships: z.array(z.string()),
    })),
  }),
  invariants: z.array(z.string()),
  microtasks: z.array(MicrotaskSchema),
});

export type Blueprint = z.output<typeof BlueprintSchema>;
export type Microtask = z.output<typeof MicrotaskSchema>;

// ── Symbol Audit ─────────────────────────────────────────────

export const SymbolAuditSchema = z.object({
  verdict: z.enum(['PASS', 'FAIL']),
  mismatches: z.array(z.object({
    kind: z.string(),
    name: z.string(),
    expected_location: z.string(),
    found: z.boolean(),
    notes: z.string().optional(),
  })),
});

export type SymbolAudit = z.output<typeof SymbolAuditSchema>;

// ── Patch (Worker Output) ────────────────────────────────────

export const PatchSchema = z.object({
  diff: z.string().min(1),
  files_changed: z.array(z.string()),
  confidence: z.number().min(0).max(1).optional(),
});

export type Patch = z.output<typeof PatchSchema>;

// ── Hygiene Audit ────────────────────────────────────────────

export const HygieneSchema = z.object({
  verdict: z.enum(['PASS', 'WARN', 'FAIL']),
  findings: z.array(z.object({
    severity: z.enum(['LOW', 'MED', 'HIGH']),
    rule_id: z.string(),
    file: z.string(),
    description: z.string(),
    recommendation: z.string().optional(),
  })),
});

export type HygieneReport = z.output<typeof HygieneSchema>;

// ── Gatekeeper ───────────────────────────────────────────────

export const GatekeeperSchema = z.object({
  verdict: z.enum(['PASS', 'FAIL']),
  reasons: z.array(z.string()),
  required_changes: z.array(z.string()),
  commit_message: z.string().optional(),
  evidence_checklist: z.array(z.string()),
});

export type GatekeeperVerdict = z.output<typeof GatekeeperSchema>;

// ── Schema registry for lookup by task name ──────────────────

export const RESPONSE_SCHEMAS = {
  'enterprise-pos-architecture-blueprint': BlueprintSchema,
  'tdd-proof-gatekeeper': GatekeeperSchema,
  'unit-test-targeted-implementation': PatchSchema,
  'repository-symbol-existence-audit': SymbolAuditSchema,
  'maintainability-architecture-hygiene-audit': HygieneSchema,
} as const;
