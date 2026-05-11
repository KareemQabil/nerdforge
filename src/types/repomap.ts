import { z } from 'zod';

export const RepoMapFileSchema = z.object({
  path: z.string(),
  size_bytes: z.number().int(),
  modified_at: z.string(),
});

export const RepoMapSchema = z.object({
  generated_at: z.string(),
  root: z.string(),
  total_files: z.number().int(),
  files: z.array(RepoMapFileSchema),
});

export type RepoMap = z.infer<typeof RepoMapSchema>;
export type RepoMapFile = z.infer<typeof RepoMapFileSchema>;
