'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { bulkMoveAction, deleteNotesAction, dropNoteAction, renumberAction } from '@/app/(admin)/actions';
import { joinForCopy } from '@/lib/export/text';
import { expandSelection, groupNotes, type NoteGroup } from '@/lib/groups';
import { SORT_LABELS, renumberConfirmText } from '@/lib/notes/filters';
import type { Sort } from '@/lib/notes/notes';
import type { Note, Tag } from '@/lib/notes/types';
import { ReorderSession } from '@/lib/reorder';
import { applyRange, idsBetween } from '@/lib/selection';
import { NoteCard } from './NoteCard';
import { TagPicker } from './TagPicker';

type Drag = { anchorId: number; base: Set<number>; select: boolean };
/** Đang kéo sắp xếp: cả bài (session trên lead các nhóm) hoặc một comment (session trên comment của nhóm `lead`). */
type Reorder = { kind: 'post'; session: ReorderSession } | { kind: 'comment'; lead: number; session: ReorderSession };

const EDGE = 48; // px gần mép màn hình thì tự cuộn khi đang kéo
const OPTION_KEYS = { number: 'bn-export-num', detail: 'bn-export-detail' } as const;
type ExportOption = keyof typeof OPTION_KEYS;

export function NoteList({
  notes,
  tags,
  exportQuery,
  singleTag,
  reorderable,
  grouped,
  sort,
  postsOnly,
}: {
  notes: Note[];
  tags: Tag[];
  exportQuery: string;
  /** Đang lọc đúng 1 tag → cho phép Đánh số lại (noteCount = tổng số ghi chú của tag). */
  singleTag: (Tag & { noteCount?: number }) | null;
  /** Cho phép kéo ⠿ (xem trọn một tag theo số). */
  reorderable: boolean;
  /** Hiện theo nhóm bài / comment. */
  grouped: boolean;
  sort: Sort;
  /** "Chỉ hiện bài viết": thu gọn hết comment. */
  postsOnly: boolean;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [options, setOptions] = useState({ number: true, detail: true });
  const [pending, startTransition] = useTransition();

  const groups = grouped ? groupNotes(notes) : [];
  const groupsRef = useRef<NoteGroup[]>(groups);
  groupsRef.current = groups;

  // ---- thu gọn (nhớ theo tag) ----
  const collapseKey = singleTag ? `bn-collapsed-${singleTag.id}` : null;
  // Tính ngay khi khởi tạo để render phía server cũng đúng với "Chỉ hiện bài viết"
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set(postsOnly ? groups.map((g) => g.lead) : []));
  useEffect(() => {
    if (postsOnly) {
      setCollapsed(new Set(groupsRef.current.map((g) => g.lead)));
      return;
    }
    try {
      const raw = collapseKey ? localStorage.getItem(collapseKey) : null;
      setCollapsed(new Set(raw ? (JSON.parse(raw) as number[]) : []));
    } catch {
      setCollapsed(new Set());
    }
  }, [collapseKey, postsOnly, notes]);
  const toggleCollapse = (lead: number) => {
    const next = new Set(collapsed);
    if (next.has(lead)) next.delete(lead);
    else next.add(lead);
    setCollapsed(next);
    if (!postsOnly && collapseKey) {
      try {
        localStorage.setItem(collapseKey, JSON.stringify([...next]));
      } catch {
        // bỏ qua
      }
    }
  };

  // ---- kéo sắp xếp: thứ tự tạm; null = theo server ----
  const [groupOrder, setGroupOrder] = useState<number[] | null>(null);
  const [commentOrder, setCommentOrder] = useState<{ lead: number; ids: number[] } | null>(null);
  const reorderRef = useRef<Reorder | null>(null);
  useEffect(() => {
    setGroupOrder(null);
    setCommentOrder(null);
  }, [notes]);

  const byLead = new Map(groups.map((g) => [g.lead, g]));
  const byId = new Map(notes.map((n) => [n.id, n]));
  const orderedGroups = (groupOrder ?? groups.map((g) => g.lead)).map((l) => byLead.get(l)!).filter(Boolean);
  const commentsOf = (g: NoteGroup) =>
    commentOrder?.lead === g.lead ? commentOrder.ids.map((id) => byId.get(id)!).filter(Boolean) : g.comments;
  const allNotes: Note[] = grouped ? orderedGroups.flatMap((g) => [...(g.post ? [g.post] : []), ...commentsOf(g)]) : notes;
  const shown: Note[] = grouped
    ? orderedGroups.flatMap((g) => [...(g.post ? [g.post] : []), ...(collapsed.has(g.lead) && g.post ? [] : commentsOf(g))])
    : notes;

  const visibleIds = shown.map((n) => n.id);
  const idsRef = useRef(visibleIds);
  idsRef.current = visibleIds;
  const dragRef = useRef<Drag | null>(null);
  const anchorRef = useRef<number | null>(null);
  const allIds = allNotes.map((n) => n.id);
  const chosen = allIds.filter((id) => selected.has(id));

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

  const finishReorderRef = useRef<(movingId: number, targetId: number, after: boolean) => void>(() => undefined);
  finishReorderRef.current = (movingId, targetId, after) => {
    startTransition(async () => {
      const res = await dropNoteAction(movingId, targetId, after);
      if (res.error) {
        setError(res.error);
        setGroupOrder(null);
        setCommentOrder(null);
      }
    });
  };

  useEffect(() => {
    const autoScroll = (e: PointerEvent) => {
      if (e.clientY < EDGE) window.scrollBy(0, -16);
      else if (e.clientY > window.innerHeight - EDGE) window.scrollBy(0, 16);
    };
    const onMove = (e: PointerEvent) => {
      const r = reorderRef.current;
      if (r) {
        autoScroll(e);
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (r.kind === 'post') {
          const block = el?.closest<HTMLElement>('[data-group-lead]');
          if (block) {
            const rect = block.getBoundingClientRect();
            setGroupOrder([...r.session.over(Number(block.dataset.groupLead), e.clientY > rect.top + rect.height / 2)]);
          }
        } else {
          const card = el?.closest<HTMLElement>('[data-note-id]');
          const block = card?.closest<HTMLElement>('[data-group-lead]');
          if (card && block && Number(block.dataset.groupLead) === r.lead) {
            const rect = card.getBoundingClientRect();
            const ids = r.session.over(Number(card.dataset.noteId), e.clientY > rect.top + rect.height / 2);
            setCommentOrder({ lead: r.lead, ids: [...ids] });
          }
        }
        return;
      }
      const drag = dragRef.current;
      if (!drag) return;
      autoScroll(e);
      const card = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-note-id]');
      if (!card) return;
      const current = Number(card.dataset.noteId);
      const next = applyRange(idsRef.current, drag.base, drag.anchorId, current, drag.select);
      setSelected(expandSelection(next, idsBetween(idsRef.current, drag.anchorId, current), drag.select, groupsRef.current));
    };
    const onUp = () => {
      dragRef.current = null;
      const r = reorderRef.current;
      if (r) {
        reorderRef.current = null;
        const target = r.session.target;
        if (r.session.finish() && target) finishReorderRef.current(r.session.movingId, target.id, target.after);
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
      const next = applyRange(visibleIds, selected, anchorRef.current, id, true);
      setSelected(expandSelection(next, idsBetween(visibleIds, anchorRef.current, id), true, groups));
      return;
    }
    const select = !selected.has(id);
    dragRef.current = { anchorId: id, base: selected, select };
    anchorRef.current = id;
    setSelected(expandSelection(applyRange(visibleIds, selected, id, id, select), [id], select, groups));
  };

  const toggle = (id: number) => {
    const select = !selected.has(id);
    const next = new Set(selected);
    if (select) next.add(id);
    else next.delete(id);
    setSelected(expandSelection(next, [id], select, groups));
  };

  const startReorder = (note: Note, e: React.PointerEvent) => {
    // Lần kéo trước còn đang lưu → chờ, tránh danh sách nhảy về thứ tự cũ giữa chừng
    if (e.button !== 0 || pending || !grouped) return;
    e.preventDefault();
    const group = groups.find((g) => g.post?.id === note.id || g.comments.some((c) => c.id === note.id));
    if (!group) return;
    if (note.sub === 0) {
      const leads = groups.map((g) => g.lead);
      reorderRef.current = { kind: 'post', session: new ReorderSession(leads, group.lead) };
      setGroupOrder(leads);
    } else {
      const ids = group.comments.map((c) => c.id);
      reorderRef.current = { kind: 'comment', lead: group.lead, session: new ReorderSession(ids, note.id) };
      setCommentOrder({ lead: group.lead, ids });
    }
  };

  const renumber = () => {
    if (!singleTag) return;
    if (!confirm(renumberConfirmText(singleTag.name, singleTag.noteCount ?? notes.length, SORT_LABELS[sort]))) return;
    const tagId = singleTag.id;
    startTransition(async () => {
      const res = await renumberAction(tagId, sort);
      setError(res.error);
    });
  };

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
    await navigator.clipboard.writeText(joinForCopy(allNotes.filter((n) => selected.has(n.id))));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const exportHref = (format: 'txt' | 'docx') => {
    const params = [
      `format=${format}`,
      exportQuery,
      ...chosen.map((id) => `id=${id}`),
      options.number ? '' : 'num=0',
      options.detail ? '' : 'detail=0',
    ].filter(Boolean);
    return `/api/export?${params.join('&')}`;
  };
  const exportScope = chosen.length ? `${chosen.length} đã chọn` : 'tất cả kết quả';

  if (!notes.length) return <p className="py-10 text-center text-slate-500">Không có ghi chú nào.</p>;

  const card = (note: Note, extra: { collapse?: Parameters<typeof NoteCard>[0]['collapse']; affected?: number }) => (
    <NoteCard
      key={`${note.id}-${note.updatedAt.getTime()}`}
      note={note}
      tags={tags}
      selected={selected.has(note.id)}
      onToggle={() => toggle(note.id)}
      onGutterPointerDown={(e) => startGutter(note.id, e)}
      reorderable={reorderable}
      onHandlePointerDown={(e) => startReorder(note, e)}
      {...extra}
    />
  );

  return (
    <div className={`space-y-3 ${pending ? 'opacity-70' : ''}`}>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl bg-slate-100/90 px-4 py-2 text-sm backdrop-blur">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={chosen.length === allIds.length}
            onChange={(e) => setSelected(e.target.checked ? new Set(allIds) : new Set())}
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
          <button onClick={renumber} className="rounded-lg border bg-white px-3 py-1" disabled={pending} title="Gán lại #1…n cho toàn tag theo cách sắp xếp đang chọn">
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
          Xuất: {exportScope} · Kéo cột ô chọn để chọn nhanh{grouped ? ' · Tick bài = chọn cả comment' : ''}
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
      {grouped
        ? orderedGroups.map((g) => {
            const comments = commentsOf(g);
            const isCollapsed = collapsed.has(g.lead) && !!g.post;
            return (
              <div key={g.lead} data-group-lead={g.lead} className="space-y-2">
                {g.post &&
                  card(g.post, {
                    collapse: comments.length
                      ? { collapsed: isCollapsed, count: comments.length, onToggle: () => toggleCollapse(g.lead) }
                      : undefined,
                    // Chỉ biết chính xác số ghi chú bị đổi khi xem trọn tag (không lọc thêm)
                    affected: reorderable ? 1 + comments.length : undefined,
                  })}
                {!isCollapsed &&
                  comments.map((c, i) => (
                    <div key={c.id} className="ml-6 border-l-2 border-slate-200 pl-2 sm:ml-10">
                      {card(c, { affected: reorderable ? comments.length - i : undefined })}
                    </div>
                  ))}
              </div>
            );
          })
        : notes.map((n) => card(n, {}))}
    </div>
  );
}
