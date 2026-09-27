'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { bulkSetTagsAction, deleteNotesAction } from '@/app/(admin)/actions';
import { joinForCopy } from '@/lib/export/text';
import type { Note, Tag } from '@/lib/notes/types';
import { applyRange } from '@/lib/selection';
import { NoteCard } from './NoteCard';
import { TagPicker } from './TagPicker';

type Drag = { anchorId: number; base: Set<number>; select: boolean };

const EDGE = 48; // px gần mép màn hình thì tự cuộn khi đang kéo chọn
const DETAIL_KEY = 'bn-export-detail';

export function NoteList({ notes, tags, exportQuery }: { notes: Note[]; tags: Tag[]; exportQuery: string }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [detailed, setDetailed] = useState(true);
  const [pending, startTransition] = useTransition();

  const visibleIds = notes.map((n) => n.id);
  const idsRef = useRef(visibleIds);
  idsRef.current = visibleIds;
  const dragRef = useRef<Drag | null>(null);
  const anchorRef = useRef<number | null>(null);

  const chosen = visibleIds.filter((id) => selected.has(id));

  useEffect(() => {
    try {
      if (localStorage.getItem(DETAIL_KEY) === '0') setDetailed(false);
    } catch {
      // localStorage bị chặn → dùng mặc định
    }
  }, []);

  const changeDetailed = (value: boolean) => {
    setDetailed(value);
    try {
      localStorage.setItem(DETAIL_KEY, value ? '1' : '0');
    } catch {
      // bỏ qua
    }
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (e.clientY < EDGE) window.scrollBy(0, -16);
      else if (e.clientY > window.innerHeight - EDGE) window.scrollBy(0, 16);
      const card = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-note-id]');
      if (card) setSelected(applyRange(idsRef.current, drag.base, drag.anchorId, Number(card.dataset.noteId), drag.select));
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  const startGutter = (id: number, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    if (e.shiftKey && anchorRef.current !== null) {
      setSelected(applyRange(visibleIds, selected, anchorRef.current, id, true));
      return;
    }
    const select = !selected.has(id);
    dragRef.current = { anchorId: id, base: selected, select };
    anchorRef.current = id;
    setSelected(applyRange(visibleIds, selected, id, id, select));
  };

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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

  const copyChosen = async () => {
    await navigator.clipboard.writeText(joinForCopy(notes.filter((n) => selected.has(n.id))));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const exportHref = (format: 'txt' | 'docx') => {
    const params = [`format=${format}`, exportQuery, ...chosen.map((id) => `id=${id}`), detailed ? '' : 'detail=0'].filter(Boolean);
    return `/api/export?${params.join('&')}`;
  };
  const exportScope = chosen.length ? `${chosen.length} đã chọn` : 'tất cả kết quả';

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
        {/* Luôn giữ chỗ cho nhóm nút (chỉ ẩn đi) để thanh không đổi chiều cao — nếu không, danh sách nhảy xuống dưới con trỏ khi bắt đầu kéo chọn. */}
        <span className={`flex flex-wrap items-center gap-3 ${chosen.length ? '' : 'invisible'}`} aria-hidden={!chosen.length}>
          <span className="text-slate-600">Đã chọn {chosen.length}</span>
          <button onClick={copyChosen} className="rounded-lg border bg-white px-3 py-1" disabled={!chosen.length}>
            {copied ? 'Đã copy' : `Copy (${chosen.length})`}
          </button>
          <button onClick={() => setPicking(!picking)} className="rounded-lg border bg-white px-3 py-1" disabled={pending || !chosen.length}>
            Chuyển tag
          </button>
          <button
            onClick={() => confirm(`Xoá ${chosen.length} ghi chú?`) && run(() => deleteNotesAction(chosen))}
            className="rounded-lg border border-red-300 bg-white px-3 py-1 text-red-600"
            disabled={pending || !chosen.length}
          >
            Xoá
          </button>
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2" title={`Xuất ${exportScope}`}>
          <label className="flex items-center gap-1" title="Bỏ tick: mỗi ghi chú chỉ giữ số #xx và nội dung">
            <input type="checkbox" checked={detailed} onChange={(e) => changeDetailed(e.target.checked)} />
            Kèm tag, ngày giờ, link
          </label>
          <a href={exportHref('txt')} download className="rounded-lg border bg-white px-3 py-1">
            Xuất TXT
          </a>
          <a href={exportHref('docx')} download className="rounded-lg border bg-white px-3 py-1">
            Xuất Word
          </a>
        </span>
        <span className="w-full text-xs text-slate-500 sm:w-auto">
          Xuất: {exportScope} · Kéo cột ô chọn để chọn nhanh
        </span>
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
          onToggle={() => toggle(note.id)}
          onGutterPointerDown={(e) => startGutter(note.id, e)}
        />
      ))}
    </div>
  );
}
