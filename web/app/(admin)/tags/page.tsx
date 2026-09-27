import { NewTagForm } from '@/components/NewTagForm';
import { TagTable } from '@/components/TagTable';
import { requireSession } from '@/lib/auth/require';
import { getDb } from '@/lib/db/client';
import { TAG_COLORS, listTagsWithCounts } from '@/lib/notes/tags';

export const dynamic = 'force-dynamic';

export default async function TagsPage() {
  await requireSession();
  const tags = await listTagsWithCounts(getDb());
  return (
    <div className="space-y-4">
      <NewTagForm />
      <TagTable tags={tags} colors={TAG_COLORS} />
    </div>
  );
}
