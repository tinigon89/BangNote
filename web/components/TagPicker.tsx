'use client';

import { useState } from 'react';
import type { Tag } from '@/lib/notes/types';

/** Chọn nhiều tag thật; không chọn gì = "Chưa phân loại". */
export function TagPicker({
  tags,
  initial,
  onApply,
  onCancel,
  applyLabel = 'Áp dụng',
}: {
  tags: Tag[];
  initial: number[];
  onApply: (tagIds: number[]) => void;
  onCancel: () => void;
  applyLabel?: string;
}) {
  const [selected, setSelected] = useState(new Set(initial));
  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const realTags = tags.filter((t) => !t.isDefault);

  return (
    <div className="space-y-2 rounded-lg border bg-white p-3 shadow">
      <div className="flex flex-wrap gap-2">
        {realTags.map((tag) => (
          <label
            key={tag.id}
            className="flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-sm"
            style={selected.has(tag.id) ? { borderColor: tag.color, backgroundColor: `${tag.color}22` } : undefined}
          >
            <input type="checkbox" checked={selected.has(tag.id)} onChange={() => toggle(tag.id)} />
            {tag.name}
          </label>
        ))}
        {!realTags.length && <span className="text-sm text-slate-500">Chưa có tag nào — tạo ở trang Tag.</span>}
      </div>
      <p className="text-xs text-slate-500">Không chọn tag nào → ghi chú về &quot;Chưa phân loại&quot;.</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onApply([...selected])}
          className="rounded-lg bg-slate-900 px-3 py-1 text-sm text-white hover:bg-slate-700"
        >
          {applyLabel}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border px-3 py-1 text-sm">
          Huỷ
        </button>
      </div>
    </div>
  );
}
