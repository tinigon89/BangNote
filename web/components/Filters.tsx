import Link from 'next/link';
import { SOURCES } from '@/lib/db/schema';
import { SOURCE_LABELS, type NoteFilters } from '@/lib/notes/filters';
import type { Tag } from '@/lib/notes/types';
import { DateFilter, SortSelect } from './FilterControls';

/** Form GET thuần — bộ lọc nằm trên URL nên bookmark được. */
export function Filters({ tags, filters }: { tags: Tag[]; filters: NoteFilters }) {
  return (
    <form method="get" className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
      <div className="flex gap-2">
        <input
          name="q"
          defaultValue={filters.q}
          placeholder="Tìm (gõ không dấu cũng được)…"
          className="flex-1 rounded-lg border px-3 py-1.5"
        />
        <button className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm text-white hover:bg-slate-700">Lọc</button>
        <Link href="/" className="rounded-lg border px-3 py-1.5 text-sm">
          Xoá lọc
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <SortSelect value={filters.sort} />
        <DateFilter filters={filters} />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        {tags.map((tag) => (
          <label key={tag.id} className="flex items-center gap-1">
            <input type="checkbox" name="tag" value={tag.id} defaultChecked={filters.tagIds.includes(tag.id)} />
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
            {tag.name}
          </label>
        ))}
        <span className="text-slate-300">|</span>
        {SOURCES.map((s) => (
          <label key={s} className="flex items-center gap-1">
            <input type="checkbox" name="source" value={s} defaultChecked={filters.sources.includes(s)} />
            {SOURCE_LABELS[s]}
          </label>
        ))}
      </div>
    </form>
  );
}
