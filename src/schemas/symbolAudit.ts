import { z } from 'zod';

/**
 * Schema: nerdforge.symbol-audit.v1
 * Response of the `repository-symbol-existence-audit` task.
 */

export const SymbolMismatchSchema = z.object({
  kind: z.enum([
    'file',
    'function',
    'type',
    'route',
    'table',
    'config_key',
    'import',
    'symbol',
  ]),
  name: z.string().min(1),
  expected_location: z.string().optional(),
  found: z.boolean(),
  notes: z.string().optional(),
});

export const SymbolAuditSchema = z.object({
  schema_version: z.literal('nerdforge.symbol-audit.v1'),
  verdict: z.enum(['PASS', 'FAIL']),
  mismatches: z.array(SymbolMismatchSchema).default([]),
  summary: z.string().default(''),
});

export type SymbolAudit = z.infer<typeof SymbolAuditSchema>;
