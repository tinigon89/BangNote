'use client';

import { useActionState, useEffect, useRef } from 'react';
import { createNoteAction } from '@/app/(admin)/actions';
import type { Tag } from '@/lib/notes/types';

export function QuickAdd({ tags }: { tags: Tag[] }) {
  const [state, formAction, pending] = useActionState(createNoteAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
      <textarea
        name="content"
        required
        rows={3}
        placeholder="Dán đoạn text cần lưu…"
        className="w-full rounded-lg border px-3 py-2"
      />
      <div className="flex flex-wrap items-center gap-2">
        {tags.map((tag) => (
          <label key={tag.id} className="flex items-center gap-1 text-sm">
            <input type="radio" name="tag" value={tag.id} defaultChecked={tag.isDefault} />
            {tag.name}
          </label>
        ))}
        <button
          disabled={pending}
          className="ml-auto rounded-lg bg-slate-900 px-4 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? 'Đang lưu…' : 'Lưu'}
        </button>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
