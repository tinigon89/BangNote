'use client';

import type { Tag } from '@/lib/notes/types';

/** Chọn 1 tag (tag như thư mục); bấm là áp dụng ngay. */
export function TagPicker({
  tags,
  current,
  onPick,
  onCancel,
  title = 'Chuyển sang tag:',
}: {
  tags: Tag[];
  current: number | null;
  onPick: (tagId: number) => void;
  onCancel: () => void;
  title?: string;
}) {
  return (
    <div className="space-y-2 rounded-lg border bg-white p-3 shadow">
      <p className="text-sm text-slate-600">{title}</p>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            onClick={() => onPick(tag.id)}
            className="rounded-full border px-3 py-0.5 text-sm"
            style={tag.id === current ? { borderColor: tag.color, backgroundColor: `${tag.color}33` } : undefined}
          >
            {tag.id === current ? '✓ ' : ''}
            {tag.name}
          </button>
        ))}
      </div>
      <button type="button" onClick={onCancel} className="rounded-lg border px-3 py-1 text-sm">
        Huỷ
      </button>
    </div>
  );
}
