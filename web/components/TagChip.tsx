import type { Tag } from '@/lib/notes/types';

export function TagChip({ tag, position }: { tag: Tag; position?: number }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: tag.color }}
    >
      {tag.name}
      {position !== undefined && <span className="ml-1 opacity-90">#{position}</span>}
    </span>
  );
}
