import type { BlueprintMicrotask } from '../schemas/blueprint.js';
import type { GatekeeperVerdict } from '../schemas/gatekeeper.js';
import type { HygieneReport } from '../schemas/hygiene.js';
import type { CommandResult } from '../runner/tests.js';

export interface ProofInput {
  microtask: BlueprintMicrotask;
  attempts: number;
  failingTestLog: string;
  passingTestLog: string;
  passingResult: CommandResult;
  hygiene: HygieneReport;
  gatekeeper: GatekeeperVerdict;
  artifactPaths: {
    request: string;
    response: string;
    patch: string;
    failingLog: string;
    passingLog: string;
    hygiene: string;
    gatekeeper: string;
  };
}

/**
 * Build the human-readable tracing proof file (`proof.md`) explaining why a
 * microtask's commit is correct. Deterministic given identical inputs.
 */
export function renderProof(input: ProofInput): string {
  const mt = input.microtask;
  const lines: string[] = [];
  lines.push(`# Tracing Proof — ${mt.id}: ${mt.title}`);
  lines.push('');
  lines.push(`> ${mt.description}`);
  lines.push('');
  lines.push('## Acceptance Criteria');
  for (const a of mt.acceptance_criteria) lines.push(`- ${a}`);
  if (mt.invariants.length) {
    lines.push('');
    lines.push('## Invariants');
    for (const i of mt.invariants) lines.push(`- ${i}`);
  }
  lines.push('');
  lines.push('## Attempts');
  lines.push(`- Attempts to PASS: **${input.attempts}**`);
  lines.push(`- Final test command: \`${input.passingResult.command}\``);
  lines.push(`- Duration: ${input.passingResult.durationMs} ms`);
  lines.push('');
  lines.push('## Evidence');
  lines.push('### Failing → Passing');
  lines.push('```');
  lines.push(tail(input.failingTestLog, 40));
  lines.push('--- after patch ---');
  lines.push(tail(input.passingTestLog, 40));
  lines.push('```');
  lines.push('');
  lines.push('## Hygiene');
  lines.push(`- Verdict: **${input.hygiene.verdict}**`);
  for (const f of input.hygiene.findings) {
    lines.push(`  - [${f.severity}] ${f.rule_id} @ ${f.file}: ${f.description}`);
  }
  lines.push('');
  lines.push('## Gatekeeper Verdict');
  lines.push(`- Verdict: **${input.gatekeeper.verdict}**`);
  if (input.gatekeeper.reasons.length) {
    lines.push('- Reasons:');
    for (const r of input.gatekeeper.reasons) lines.push(`  - ${r}`);
  }
  if (input.gatekeeper.evidence_checklist.length) {
    lines.push('- Evidence checklist:');
    for (const e of input.gatekeeper.evidence_checklist) {
      lines.push(`  - [${e.present ? 'x' : ' '}] ${e.item}`);
    }
  }
  lines.push('');
  lines.push('## Artifact Paths');
  for (const [k, v] of Object.entries(input.artifactPaths)) {
    lines.push(`- \`${k}\`: \`${v}\``);
  }
  lines.push('');
  return lines.join('\n');
}

function tail(s: string, n: number): string {
  const arr = s.split(/\r?\n/);
  return arr.slice(Math.max(0, arr.length - n)).join('\n');
}
