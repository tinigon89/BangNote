import { Filters } from '@/components/Filters';
import { NoteList } from '@/components/NoteList';
import { Pager } from '@/components/Pager';
import { QuickAdd } from '@/components/QuickAdd';
import { requireSession } from '@/lib/auth/require';
import { getDb } from '@/lib/db/client';
import {
  NOTES_PER_PAGE,
  POSTS_PER_PAGE,
  canReorder,
  filtersToQuery,
  isGrouped,
  parseNoteFilters,
  toListFilter,
} from '@/lib/notes/filters';
import { listNotesPage, listPostsPage } from '@/lib/notes/notes';
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
  const tags = await listTagsWithCounts(db);
  const singleTag = filters.tagIds.length === 1 ? (tags.find((t) => t.id === filters.tagIds[0]) ?? null) : null;
  const grouped = isGrouped(filters) && !!singleTag;
  const result = grouped
    ? await listPostsPage(db, { ...toListFilter(filters), tagId: singleTag!.id }, filters.page, POSTS_PER_PAGE)
    : await listNotesPage(db, toListFilter(filters), filters.page, NOTES_PER_PAGE);

  return (
    <div className="space-y-4">
      <QuickAdd tags={tags} />
      <Filters tags={tags} filters={filters} />
      <NoteList
        notes={result.notes}
        tags={tags}
        exportQuery={filtersToQuery({ ...filters, page: 1 })}
        singleTag={singleTag}
        reorderable={canReorder(filters)}
        grouped={grouped}
        sort={filters.sort}
        postsOnly={filters.posts}
      />
      <Pager
        page={result.page}
        pageCount={result.pageCount}
        hrefFor={(page) => `/?${filtersToQuery({ ...filters, page })}`}
      />
    </div>
  );
}
