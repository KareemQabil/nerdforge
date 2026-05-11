import { describe, it, expect } from 'vitest';
import {
  BlueprintSchema,
  PatchResponseSchema,
  HygieneReportSchema,
  GatekeeperVerdictSchema,
  SymbolAuditSchema,
  MicrotaskListSchema,
} from '../src/schemas/index.js';

describe('response schemas', () => {
  it('Blueprint requires schema_version literal and well-formed microtask ids', () => {
    const good = {
      schema_version: 'nerdforge.blueprint.v1',
      system_name: 'pos',
      goal: 'add x',
      domain_modules: ['catalog'],
      database: { entities: [], relationships: [] },
      invariants: [],
      microtasks: [
        {
          id: 'MT-001',
          title: 't',
          description: 'd',
          expected_files: ['a.ts'],
          tests: { new: [], modified: [], commands: [] },
          acceptance_criteria: ['c'],
          invariants: [],
          tracing_proof_requirements: [],
        },
      ],
    };
    expect(BlueprintSchema.safeParse(good).success).toBe(true);

    const badId = structuredClone(good) as typeof good;
    badId.microtasks[0]!.id = '1';
    expect(BlueprintSchema.safeParse(badId).success).toBe(false);

    const missingVersion = { ...good, schema_version: 'wrong' } as unknown;
    expect(BlueprintSchema.safeParse(missingVersion).success).toBe(false);
  });

  it('PatchResponse rejects diffs missing unified-diff headers', () => {
    const ok = PatchResponseSchema.safeParse({
      schema_version: 'nerdforge.patch.v1',
      microtask_id: 'MT-001',
      rationale: 'fixes failing test',
      diff: 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@\n-old\n+new\n',
      touched_files: ['x'],
    });
    expect(ok.success).toBe(true);

    const bad = PatchResponseSchema.safeParse({
      schema_version: 'nerdforge.patch.v1',
      microtask_id: 'MT-001',
      rationale: 'r',
      diff: 'just some prose, no diff headers',
      touched_files: ['x'],
    });
    expect(bad.success).toBe(false);
  });

  it('Hygiene requires severity to be LOW|MED|HIGH', () => {
    const bad = HygieneReportSchema.safeParse({
      schema_version: 'nerdforge.hygiene.v1',
      verdict: 'PASS',
      findings: [
        {
          severity: 'CRITICAL',
          rule_id: 'r',
          file: 'f',
          description: 'd',
          recommendation: 'r',
        },
      ],
    });
    expect(bad.success).toBe(false);
  });

  it('Gatekeeper accepts only PASS|FAIL', () => {
    const ok = GatekeeperVerdictSchema.safeParse({
      schema_version: 'nerdforge.gatekeeper.v1',
      verdict: 'PASS',
      reasons: ['lgtm'],
      required_changes: [],
      commit_message: 'feat: thing',
      evidence_checklist: [{ item: 'tests run', present: true }],
    });
    expect(ok.success).toBe(true);

    const bad = GatekeeperVerdictSchema.safeParse({
      schema_version: 'nerdforge.gatekeeper.v1',
      verdict: 'MAYBE',
    });
    expect(bad.success).toBe(false);
  });

  it('SymbolAudit enforces verdict enum and mismatch.kind enum', () => {
    expect(
      SymbolAuditSchema.safeParse({
        schema_version: 'nerdforge.symbol-audit.v1',
        verdict: 'PASS',
      }).success,
    ).toBe(true);
    expect(
      SymbolAuditSchema.safeParse({
        schema_version: 'nerdforge.symbol-audit.v1',
        verdict: 'PASS',
        mismatches: [{ kind: 'banana', name: 'x', found: false }],
      }).success,
    ).toBe(false);
  });

  it('MicrotaskList requires at least one microtask', () => {
    const bad = MicrotaskListSchema.safeParse({
      schema_version: 'nerdforge.microtasks.v1',
      source_blueprint: 'x',
      microtasks: [],
    });
    expect(bad.success).toBe(false);
  });
});
