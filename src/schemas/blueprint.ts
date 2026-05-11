import { z } from 'zod';

/**
 * Schema: nerdforge.blueprint.v1
 * Response of the `enterprise-pos-architecture-blueprint` task.
 * Pure architectural specification — no implementation code.
 */

export const BlueprintEntitySchema = z.object({
  name: z.string().min(1),
  fields: z
    .array(
      z.object({
        name: z.string().min(1),
        type: z.string().min(1),
        nullable: z.boolean().optional(),
        notes: z.string().optional(),
      }),
    )
    .default([]),
  notes: z.string().optional(),
});

export const BlueprintRelationshipSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  kind: z.enum(['one-to-one', 'one-to-many', 'many-to-many']),
  notes: z.string().optional(),
});

export const BlueprintMicrotaskSchema = z.object({
  id: z.string().regex(/^MT-\d{3,}$/, 'Microtask id must match /^MT-\\d{3,}$/'),
  title: z.string().min(1),
  description: z.string().min(1),
  expected_files: z.array(z.string().min(1)).min(1),
  tests: z.object({
    new: z.array(z.string()).default([]),
    modified: z.array(z.string()).default([]),
    commands: z.array(z.string()).default([]),
  }),
  acceptance_criteria: z.array(z.string().min(1)).min(1),
  invariants: z.array(z.string()).default([]),
  tracing_proof_requirements: z.array(z.string()).default([]),
});

export const BlueprintSchema = z.object({
  schema_version: z.literal('nerdforge.blueprint.v1'),
  system_name: z.string().min(1),
  goal: z.string().min(1),
  domain_modules: z.array(z.string().min(1)).min(1),
  database: z.object({
    entities: z.array(BlueprintEntitySchema).default([]),
    relationships: z.array(BlueprintRelationshipSchema).default([]),
  }),
  invariants: z.array(z.string()).default([]),
  microtasks: z.array(BlueprintMicrotaskSchema).min(1),
});

export type Blueprint = z.infer<typeof BlueprintSchema>;
export type BlueprintMicrotask = z.infer<typeof BlueprintMicrotaskSchema>;
