import type { Tag } from '@/lib/notes/types';

export function TagChip({ tag, number }: { tag: Tag; number?: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: tag.color }}
    >
      {tag.name}
      {number !== undefined && <span className="ml-1 opacity-90">#{number}</span>}
    </span>
  );
}
