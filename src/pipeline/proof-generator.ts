import type { GatekeeperVerdict, HygieneReport } from '../types/schemas.js';
import type { TestResult } from './test-runner.js';

/**
 * Generate a human-readable tracing proof markdown document.
 * This is the evidence artifact that proves a change is correct.
 */
export function generateProof(params: {
  microtaskId: string;
  microtaskTitle: string;
  attempt: number;
  failingTestLog: string;
  diff: string;
  passingTestLog: string;
  testResult: TestResult;
  hygieneReport: HygieneReport;
  gatekeeperVerdict: GatekeeperVerdict;
  artifactPaths: Record<string, string>;
}): string {
  const {
    microtaskId,
    microtaskTitle,
    attempt,
    failingTestLog,
    diff,
    passingTestLog,
    testResult,
    hygieneReport,
    gatekeeperVerdict,
    artifactPaths,
  } = params;

  return `# Tracing Proof: ${microtaskId}

## Microtask
- **ID**: ${microtaskId}
- **Title**: ${microtaskTitle}
- **Attempt**: ${attempt}
- **Timestamp**: ${new Date().toISOString()}

## 1. Failing Test Evidence
\`\`\`
${failingTestLog.slice(0, 2000)}
\`\`\`

## 2. Patch Applied
\`\`\`diff
${diff.slice(0, 3000)}
\`\`\`

## 3. Passing Test Evidence
- **Result**: ${testResult.passed ? 'PASS ✓' : 'FAIL ✗'}
- **Exit Code**: ${testResult.exitCode}
- **Duration**: ${testResult.duration_ms}ms

\`\`\`
${passingTestLog.slice(0, 2000)}
\`\`\`

## 4. Hygiene Audit
- **Verdict**: ${hygieneReport.verdict}
- **Findings**: ${hygieneReport.findings.length}

${hygieneReport.findings.map((f) => `- [${f.severity}] ${f.file}: ${f.description}`).join('\n')}

## 5. Gatekeeper Verdict
- **Verdict**: ${gatekeeperVerdict.verdict}
- **Commit Message**: ${gatekeeperVerdict.commit_message || 'N/A'}

### Reasons
${gatekeeperVerdict.reasons.map((r) => `- ${r}`).join('\n')}

### Evidence Checklist
${gatekeeperVerdict.evidence_checklist.map((e) => `- [x] ${e}`).join('\n')}

## 6. Artifact Paths
${Object.entries(artifactPaths).map(([k, v]) => `- **${k}**: ${v}`).join('\n')}
`;
}
