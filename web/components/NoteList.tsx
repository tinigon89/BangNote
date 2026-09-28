'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { bulkMoveAction, deleteNotesAction, renumberAction, reorderAction } from '@/app/(admin)/actions';
import { joinForCopy } from '@/lib/export/text';
import type { Note, Tag } from '@/lib/notes/types';
import { applyRange, moveItem } from '@/lib/selection';
import { NoteCard } from './NoteCard';
import { TagPicker } from './TagPicker';

type Drag = { anchorId: number; base: Set<number>; select: boolean };

const EDGE = 48; // px gần mép màn hình thì tự cuộn khi đang kéo chọn
const OPTION_KEYS = { number: 'bn-export-num', detail: 'bn-export-detail' } as const;
type ExportOption = keyof typeof OPTION_KEYS;

export function NoteList({
  notes,
  tags,
  exportQuery,
  singleTag,
  reorderable,
}: {
  notes: Note[];
  tags: Tag[];
  exportQuery: string;
  /** Đang lọc đúng 1 tag → cho phép Đánh số lại. */
  singleTag: Tag | null;
  /** Lọc 1 tag + sort theo số → cho phép kéo sắp xếp. */
  reorderable: boolean;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [options, setOptions] = useState({ number: true, detail: true });
  const [pending, startTransition] = useTransition();

  // Thứ tự tạm trong lúc kéo sắp xếp; null = theo server.
  const [order, setOrder] = useState<number[] | null>(null);
  const reorderRef = useRef<number | null>(null);
  useEffect(() => setOrder(null), [notes]);
  const byId = new Map(notes.map((n) => [n.id, n]));
  const shown = (order ?? notes.map((n) => n.id)).map((id) => byId.get(id)!).filter(Boolean);

  const visibleIds = shown.map((n) => n.id);
  const idsRef = useRef(visibleIds);
  idsRef.current = visibleIds;
  const dragRef = useRef<Drag | null>(null);
  const anchorRef = useRef<number | null>(null);

  const chosen = visibleIds.filter((id) => selected.has(id));

  useEffect(() => {
    try {
      setOptions({
        number: localStorage.getItem(OPTION_KEYS.number) !== '0',
        detail: localStorage.getItem(OPTION_KEYS.detail) !== '0',
      });
    } catch {
      // localStorage bị chặn → dùng mặc định
    }
  }, []);

  const changeOption = (key: ExportOption, value: boolean) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
    try {
      localStorage.setItem(OPTION_KEYS[key], value ? '1' : '0');
    } catch {
      // bỏ qua
    }
  };

  const finishReorderRef = useRef<() => void>(() => undefined);
  finishReorderRef.current = () => {
    if (!singleTag || !order || order.every((id, i) => id === notes[i]?.id)) return;
    const tagId = singleTag.id;
    const next = order;
    startTransition(async () => {
      const res = await reorderAction(tagId, next);
      if (res.error) {
        setError(res.error);
        setOrder(null);
      }
    });
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const moving = reorderRef.current;
      if (moving !== null) {
        if (e.clientY < EDGE) window.scrollBy(0, -16);
        else if (e.clientY > window.innerHeight - EDGE) window.scrollBy(0, 16);
        const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-note-id]');
        if (over) setOrder((prev) => moveItem(prev ?? idsRef.current, moving, Number(over.dataset.noteId)));
        return;
      }
      const drag = dragRef.current;
      if (!drag) return;
      if (e.clientY < EDGE) window.scrollBy(0, -16);
      else if (e.clientY > window.innerHeight - EDGE) window.scrollBy(0, 16);
      const card = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-note-id]');
      if (card) setSelected(applyRange(idsRef.current, drag.base, drag.anchorId, Number(card.dataset.noteId), drag.select));
    };
    const onUp = () => {
      dragRef.current = null;
      if (reorderRef.current !== null) {
        reorderRef.current = null;
        finishReorderRef.current();
      }
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

  const startReorder = (id: number, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    reorderRef.current = id;
    setOrder(notes.map((n) => n.id));
  };

  const renumber = () => {
    if (!singleTag) return;
    if (!confirm(`Đánh số lại ${visibleIds.length} ghi chú trong tag "${singleTag.name}" theo thứ tự đang hiển thị?`)) return;
    const tagId = singleTag.id;
    startTransition(async () => {
      const res = await renumberAction(tagId, visibleIds);
      setError(res.error);
    });
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
    await navigator.clipboard.writeText(joinForCopy(shown.filter((n) => selected.has(n.id))));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const exportHref = (format: 'txt' | 'docx') => {
    const params = [`format=${format}`, exportQuery, ...chosen.map((id) => `id=${id}`), options.number ? '' : 'num=0', options.detail ? '' : 'detail=0'].filter(Boolean);
    return `/api/export?${params.join('&')}`;
  };
  const exportScope = chosen.length ? `${chosen.length} đã chọn` : 'tất cả kết quả';

  if (!notes.length) return <p className="py-10 text-center text-slate-500">Không có ghi chú nào.</p>;

  return (
    <div className={`space-y-3 ${pending ? 'opacity-70' : ''}`}>
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
        {singleTag && (
          <button onClick={renumber} className="rounded-lg border bg-white px-3 py-1" disabled={pending} title="Gán lại #1…n theo thứ tự đang hiển thị">
            Đánh số lại
          </button>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-2" title={`Xuất ${exportScope}`}>
          <label className="flex items-center gap-1" title="Kèm số thứ tự trong tag">
            <input type="checkbox" checked={options.number} onChange={(e) => changeOption('number', e.target.checked)} />
            Kèm số #
          </label>
          <label className="flex items-center gap-1" title="Kèm tên tag, ngày giờ và link nguồn">
            <input type="checkbox" checked={options.detail} onChange={(e) => changeOption('detail', e.target.checked)} />
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
          current={null}
          title={`Chuyển ${chosen.length} ghi chú sang tag:`}
          onPick={(tagId) => run(() => bulkMoveAction(chosen, tagId))}
          onCancel={() => setPicking(false)}
        />
      )}
      {shown.map((note) => (
        <NoteCard
          key={`${note.id}-${note.updatedAt.getTime()}`}
          note={note}
          tags={tags}
          selected={selected.has(note.id)}
          onToggle={() => toggle(note.id)}
          onGutterPointerDown={(e) => startGutter(note.id, e)}
          reorderable={reorderable}
          onHandlePointerDown={(e) => startReorder(note.id, e)}
        />
      ))}
    </div>
  );
}
