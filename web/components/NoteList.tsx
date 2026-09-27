'use client';

import { useState, useTransition } from 'react';
import { bulkSetTagsAction, deleteNotesAction } from '@/app/(admin)/actions';
import type { Note, Tag } from '@/lib/notes/types';
import { NoteCard } from './NoteCard';
import { TagPicker } from './TagPicker';

export function NoteList({ notes, tags }: { notes: Note[]; tags: Tag[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const visibleIds = notes.map((n) => n.id);
  const chosen = visibleIds.filter((id) => selected.has(id));

  const select = (id: number, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const run = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      setError(res.error);
      if (!res.error) {
        setSelected(new Set());
        setPicking(false);
      }
    });

  if (!notes.length) return <p className="py-10 text-center text-slate-500">Không có ghi chú nào.</p>;

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl bg-slate-100/90 px-4 py-2 text-sm backdrop-blur">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={chosen.length === notes.length}
            onChange={(e) => setSelected(e.target.checked ? new Set(visibleIds) : new Set())}
          />
          Chọn tất cả
        </label>
        {chosen.length > 0 && (
          <>
            <span className="text-slate-600">Đã chọn {chosen.length}</span>
            <button onClick={() => setPicking(!picking)} className="rounded-lg border bg-white px-3 py-1" disabled={pending}>
              Chuyển tag
            </button>
            <button
              onClick={() => confirm(`Xoá ${chosen.length} ghi chú?`) && run(() => deleteNotesAction(chosen))}
              className="rounded-lg border border-red-300 bg-white px-3 py-1 text-red-600"
              disabled={pending}
            >
              Xoá
            </button>
          </>
        )}
        {error && <span className="text-red-600">{error}</span>}
      </div>
      {picking && chosen.length > 0 && (
        <TagPicker
          tags={tags}
          initial={[]}
          applyLabel={`Chuyển ${chosen.length} ghi chú`}
          onApply={(tagIds) => run(() => bulkSetTagsAction(chosen, tagIds))}
          onCancel={() => setPicking(false)}
        />
      )}
      {notes.map((note) => (
        <NoteCard
          key={`${note.id}-${note.updatedAt.getTime()}`}
          note={note}
          tags={tags}
          selected={selected.has(note.id)}
          onSelect={(checked) => select(note.id, checked)}
        />
      ))}
    </div>
  );
}
