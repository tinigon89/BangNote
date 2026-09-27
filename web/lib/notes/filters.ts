import { SOURCES, type Source } from '@/lib/db/schema';

export interface NoteFilters {
  q: string;
  tagIds: number[];
  sources: Source[];
  limit: number;
}

export const PAGE_SIZE = 50;

export const SOURCE_LABELS: Record<Source, string> = {
  telegram: 'Telegram',
  extension: 'Extension',
  widget: 'Widget',
  web: 'Web',
};

type SearchParams = Record<string, string | string[] | undefined>;

const all = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

export function parseNoteFilters(sp: SearchParams): NoteFilters {
  const tagIds = [...new Set(all(sp.tag).filter((s) => /^\d+$/.test(s)).map(Number))].filter((n) => n > 0);
  const sources = [...new Set(all(sp.source))].filter((s): s is Source => (SOURCES as readonly string[]).includes(s));
  const rawLimit = Number(all(sp.limit)[0]);
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : PAGE_SIZE;
  return { q: (all(sp.q)[0] ?? '').trim(), tagIds, sources, limit };
}

export function filtersToQuery(f: NoteFilters): string {
  const params = new URLSearchParams();
  if (f.q) params.set('q', f.q);
  for (const id of f.tagIds) params.append('tag', String(id));
  for (const s of f.sources) params.append('source', s);
  if (f.limit !== PAGE_SIZE) params.set('limit', String(f.limit));
  return params.toString();
}
