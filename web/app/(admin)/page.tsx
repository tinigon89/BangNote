import Link from 'next/link';
import { Filters } from '@/components/Filters';
import { NoteList } from '@/components/NoteList';
import { QuickAdd } from '@/components/QuickAdd';
import { requireSession } from '@/lib/auth/require';
import { getDb } from '@/lib/db/client';
import { PAGE_SIZE, filtersToQuery, parseNoteFilters, toListFilter } from '@/lib/notes/filters';
import { listNotes } from '@/lib/notes/notes';
import { listTags } from '@/lib/notes/tags';

export const dynamic = 'force-dynamic';

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();
  const filters = parseNoteFilters(await searchParams);
  const db = getDb();
  const [tags, result] = await Promise.all([listTags(db), listNotes(db, toListFilter(filters))]);
  const more = filtersToQuery({ ...filters, limit: Math.min(filters.limit + PAGE_SIZE, 500) });

  return (
    <div className="space-y-4">
      <QuickAdd tags={tags} />
      <Filters tags={tags} filters={filters} />
      <NoteList notes={result.notes} tags={tags} exportQuery={filtersToQuery({ ...filters, limit: PAGE_SIZE })} />
      {result.hasMore && filters.limit < 500 && (
        <Link href={`/?${more}`} scroll={false} className="block rounded-xl border bg-white py-2 text-center text-sm">
          Tải thêm
        </Link>
      )}
    </div>
  );
}
