'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { deleteTagAction, updateTagAction } from '@/app/(admin)/tags/actions';
import type { Tag } from '@/lib/notes/types';

type Row = Tag & { noteCount: number };

function TagRow({ tag, colors }: { tag: Row; colors: readonly string[] }) {
  const [name, setName] = useState(tag.name);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      setError(res.error);
      if (res.error) setName(tag.name);
    });

  return (
    <li className={`space-y-1 px-4 py-3 ${pending ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="h-4 w-4 rounded-full" style={{ backgroundColor: tag.color }} />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== tag.name && run(() => updateTagAction(tag.id, { name }))}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          maxLength={50}
          className="min-w-0 flex-1 rounded border border-transparent px-2 py-1 hover:border-slate-300 focus:border-slate-400"
        />
        {tag.isDefault && <span className="text-xs text-slate-500">mặc định</span>}
        <Link href={`/?tag=${tag.id}`} className="text-sm text-blue-600 hover:underline">
          {tag.noteCount} ghi chú
        </Link>
        {!tag.isDefault && (
          <button
            onClick={() =>
              confirm(`Xoá tag "${tag.name}"? Ghi chú không còn tag nào sẽ về "Chưa phân loại".`) &&
              run(() => deleteTagAction(tag.id))
            }
            className="text-sm text-slate-500 hover:text-red-600"
          >
            Xoá
          </button>
        )}
      </div>
      <div className="flex gap-1 pl-7">
        {colors.map((c) => (
          <button
            key={c}
            onClick={() => c !== tag.color && run(() => updateTagAction(tag.id, { color: c }))}
            className={`h-5 w-5 rounded-full ${c === tag.color ? 'ring-2 ring-slate-900 ring-offset-1' : ''}`}
            style={{ backgroundColor: c }}
            aria-label={`Màu ${c}`}
          />
        ))}
      </div>
      {error && <p className="pl-7 text-sm text-red-600">{error}</p>}
    </li>
  );
}

export function TagTable({ tags, colors }: { tags: Row[]; colors: readonly string[] }) {
  return (
    <ul className="divide-y rounded-xl bg-white shadow-sm">
      {tags.map((tag) => (
        <TagRow key={`${tag.id}-${tag.name}-${tag.color}`} tag={tag} colors={colors} />
      ))}
    </ul>
  );
}
