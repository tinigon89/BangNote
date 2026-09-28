import { z } from 'zod';
import { SOURCES } from '@/lib/db/schema';

const tagIds = z.array(z.number().int().positive()).max(50);

const truncated = (max: number) =>
  z
    .string()
    .nullish()
    .transform((v) => (v ? v.slice(0, max) : null));

export const createNoteBody = z.object({
  content: z.string(),
  source: z.enum(SOURCES),
  tagIds: tagIds.optional(),
  sourceUrl: truncated(2000),
  sourceTitle: truncated(500),
  newPost: z.boolean().optional(),
});

export const setTagsBody = z.object({ tagIds });

export const noteIdParam = z.coerce.number().int().positive();
