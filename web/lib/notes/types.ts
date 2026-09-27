import type { Source } from '@/lib/db/schema';

export interface Tag {
  id: number;
  name: string;
  color: string;
  isDefault: boolean;
}

export interface Note {
  id: number;
  content: string;
  source: Source;
  sourceUrl: string | null;
  sourceTitle: string | null;
  createdAt: Date;
  updatedAt: Date;
  tags: Tag[];
}

export function sortTags<T extends Tag>(list: T[]): T[] {
  return [...list].sort((a, b) =>
    a.isDefault === b.isDefault ? a.name.localeCompare(b.name, 'vi') : a.isDefault ? -1 : 1,
  );
}
