import { z } from 'zod';
import { BlueprintMicrotaskSchema } from './blueprint.js';

/**
 * Schema: nerdforge.microtasks.v1
 * Normalised microtask list derived from a blueprint.
 */
export const MicrotaskListSchema = z.object({
  schema_version: z.literal('nerdforge.microtasks.v1'),
  source_blueprint: z.string().min(1),
  microtasks: z.array(BlueprintMicrotaskSchema).min(1),
});

export type MicrotaskList = z.infer<typeof MicrotaskListSchema>;
