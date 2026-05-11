import { z } from 'zod';

/**
 * Schema: nerdforge.gatekeeper.v1
 * Response of the `tdd-proof-gatekeeper` task.
 */
export const GatekeeperVerdictSchema = z.object({
  schema_version: z.literal('nerdforge.gatekeeper.v1'),
  verdict: z.enum(['PASS', 'FAIL']),
  reasons: z.array(z.string().min(1)).default([]),
  required_changes: z.array(z.string()).default([]),
  commit_message: z.string().optional().default(''),
  evidence_checklist: z
    .array(
      z.object({
        item: z.string().min(1),
        present: z.boolean(),
      }),
    )
    .default([]),
});

export type GatekeeperVerdict = z.infer<typeof GatekeeperVerdictSchema>;
