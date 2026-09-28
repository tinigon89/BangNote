import { Filters } from '@/components/Filters';
import { NoteList } from '@/components/NoteList';
import { QuickAdd } from '@/components/QuickAdd';
import { requireSession } from '@/lib/auth/require';
import { getDb } from '@/lib/db/client';
import { NOTES_PER_PAGE, canReorder, filtersToQuery, parseNoteFilters, toListFilter } from '@/lib/notes/filters';
import { listNotesPage } from '@/lib/notes/notes';
import { listTagsWithCounts } from '@/lib/notes/tags';

export const dynamic = 'force-dynamic';

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();
  const filters = parseNoteFilters(await searchParams);
  const db = getDb();
  const [tags, result] = await Promise.all([listTagsWithCounts(db), listNotesPage(db, toListFilter(filters), filters.page, NOTES_PER_PAGE)]);
  const singleTag = filters.tagIds.length === 1 ? (tags.find((t) => t.id === filters.tagIds[0]) ?? null) : null;

  return (
    <div className="space-y-4">
      <QuickAdd tags={tags} />
      <Filters tags={tags} filters={filters} />
      <NoteList notes={result.notes} tags={tags} exportQuery={filtersToQuery({ ...filters, page: 1 })}
        singleTag={singleTag}
        reorderable={canReorder(filters)}
      />
    </div>
  );
}
