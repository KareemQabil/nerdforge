import { z } from 'zod';

/**
 * Schema: nerdforge.hygiene.v1
 * Response of the `maintainability-architecture-hygiene-audit` task.
 */
export const HygieneFindingSchema = z.object({
  severity: z.enum(['LOW', 'MED', 'HIGH']),
  rule_id: z.string().min(1),
  file: z.string().min(1),
  description: z.string().min(1),
  recommendation: z.string().min(1),
});

export const HygieneReportSchema = z.object({
  schema_version: z.literal('nerdforge.hygiene.v1'),
  verdict: z.enum(['PASS', 'WARN', 'FAIL']),
  findings: z.array(HygieneFindingSchema).default([]),
  summary: z.string().default(''),
});

export type HygieneReport = z.infer<typeof HygieneReportSchema>;
