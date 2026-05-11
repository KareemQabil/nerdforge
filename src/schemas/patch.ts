import { z } from 'zod';

/**
 * Schema: nerdforge.patch.v1
 * Response of the `unit-test-targeted-implementation` task.
 *
 * Strict JSON wrapper carrying a unified diff. The wrapper makes provenance
 * and constraints inspectable; the diff is the only mutating payload.
 */
export const PatchResponseSchema = z.object({
  schema_version: z.literal('nerdforge.patch.v1'),
  microtask_id: z.string().min(1),
  rationale: z.string().min(1),
  diff: z
    .string()
    .min(1)
    .refine(
      (d) => /^diff --git /m.test(d) || /^--- /m.test(d),
      'diff must be a unified diff containing "diff --git" or "---" headers',
    ),
  touched_files: z.array(z.string().min(1)).min(1),
  notes: z.string().optional().default(''),
});

export type PatchResponse = z.infer<typeof PatchResponseSchema>;
