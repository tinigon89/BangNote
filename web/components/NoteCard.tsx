'use client';

import { useState, useTransition } from 'react';
import { deleteNotesAction, mergePostAction, moveNoteAction, splitPostAction, updateNoteAction } from '@/app/(admin)/actions';
import { formatRelative } from '@/lib/format';
import { SOURCE_LABELS } from '@/lib/notes/filters';
import { formatNumber } from '@/lib/notes/number';
import type { Note, Tag } from '@/lib/notes/types';
import { TagChip } from './TagChip';
import { TagPicker } from './TagPicker';

export function NoteCard({
  note,
  tags,
  selected,
  onToggle,
  onGutterPointerDown,
  reorderable = false,
  onHandlePointerDown,
  collapse,
  affected,
}: {
  note: Note;
  tags: Tag[];
  selected: boolean;
  /** Bật/tắt bằng bàn phím (Space trên ô chọn). */
  onToggle: () => void;
  /** Nhấn vào cột chọn bên trái: click, Shift+click hoặc bắt đầu kéo chọn. */
  onGutterPointerDown: (e: React.PointerEvent) => void;
  /** Hiện tay nắm ⠿ để kéo sắp xếp (chỉ khi lọc 1 tag + sort theo số). */
  reorderable?: boolean;
  onHandlePointerDown?: (e: React.PointerEvent) => void;
  /** Thẻ bài có comment trong chế độ nhóm: nút thu gọn/mở. */
  collapse?: { collapsed: boolean; count: number; onToggle: () => void };
  /** Số ghi chú bị đổi số khi bấm 📌/↳ (để hỏi xác nhận khi > 1); không biết → coi như nhiều. */
  affected?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.content);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const number = formatNumber(note.position, note.sub);
  const label = `${note.tags[0].name} #${number}`;

  const long = note.content.split('\n').length > 6 || note.content.length > 600;

  const run = (fn: () => Promise<{ error?: string }>, after?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      setError(res.error);
      if (!res.error) after?.();
    });

  const copy = async () => {
    await navigator.clipboard.writeText(note.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <article
      data-note-id={note.id}
      className={`relative space-y-2 rounded-xl bg-white p-4 pl-12 shadow-sm ${selected ? 'ring-2 ring-blue-400' : ''} ${pending ? 'opacity-60' : ''}`}
    >
      <div
        onPointerDown={onGutterPointerDown}
        className="absolute inset-y-0 left-0 flex w-10 items-start cursor-pointer touch-none select-none justify-center rounded-l-xl pt-5 hover:bg-slate-100"
        title="Kéo lên/xuống để chọn nhiều · Shift+click để chọn cả đoạn"
      >
        {/* pointer-events-none: chuột đi qua cột chọn; ô vẫn nhận Space từ bàn phím */}
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="pointer-events-none"
          aria-label={`Chọn ghi chú ${label}`}
        />
      </div>
      <div className="flex items-start gap-3">
        {reorderable && (
          <span
            onPointerDown={onHandlePointerDown}
            className="cursor-grab touch-none select-none px-1 text-lg leading-6 text-slate-400 hover:text-slate-700"
            title="Kéo để sắp xếp lại"
            aria-label="Kéo để sắp xếp lại"
          >
            ⠿
          </span>
        )}
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={Math.min(Math.max(draft.split('\n').length, 3), 20)}
                className="w-full rounded-lg border px-3 py-2"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => run(() => updateNoteAction(note.id, draft), () => setEditing(false))}
                  className="rounded-lg bg-slate-900 px-3 py-1 text-sm text-white"
                >
                  Lưu
                </button>
                <button
                  onClick={() => {
                    setDraft(note.content);
                    setEditing(false);
                  }}
                  className="rounded-lg border px-3 py-1 text-sm"
                >
                  Huỷ
                </button>
              </div>
            </div>
          ) : (
            <p
              onClick={() => long && setExpanded(!expanded)}
              className={`whitespace-pre-wrap break-words ${long && !expanded ? 'line-clamp-6 cursor-pointer' : ''}`}
            >
              {note.content}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <button onClick={() => setPicking(!picking)} className="flex flex-wrap gap-1" title="Chuyển tag">
          <TagChip tag={note.tags[0]} number={number} />
        </button>
        {collapse && (
          <button onClick={collapse.onToggle} className="text-xs hover:text-slate-900" title={collapse.collapsed ? 'Mở comment' : 'Thu gọn comment'}>
            {collapse.collapsed ? `▸ ${collapse.count} comment` : '▾'}
          </button>
        )}
        <span>
          {SOURCE_LABELS[note.source]} ·{' '}
          <time dateTime={note.createdAt.toISOString()} suppressHydrationWarning>
            {formatRelative(note.createdAt)}
          </time>
        </span>
        {note.sourceUrl && (
          <a href={note.sourceUrl} target="_blank" rel="noreferrer" className="max-w-xs truncate text-blue-600 hover:underline">
            {note.sourceTitle || note.sourceUrl}
          </a>
        )}
        <span className="ml-auto flex gap-3">
          {note.sub > 0 && (
            <button
              onClick={() =>
                ((affected ?? 1) <= 1 || confirm(`Tách ${label} và các comment sau nó thành bài mới?`)) &&
                run(() => splitPostAction(note.id))
              }
              className="hover:text-slate-900"
              title="Ghi chú này là nội dung bài viết mới"
            >
              📌 Bài mới
            </button>
          )}
          {note.sub === 0 && note.position > 1 && (
            <button
              onClick={() => confirm(`Gộp bài ${label} (và comment của nó) vào bài trước?`) && run(() => mergePostAction(note.id))}
              className="hover:text-slate-900"
              title="Biến bài này thành comment của bài trước"
            >
              ↳ Gộp vào bài trước
            </button>
          )}
          <button onClick={copy} className="hover:text-slate-900">
            {copied ? 'Đã copy' : 'Copy'}
          </button>
          <button onClick={() => setEditing(true)} className="hover:text-slate-900">
            Sửa
          </button>
          <button
            onClick={() => confirm(`Xoá ghi chú ${label}?`) && run(() => deleteNotesAction([note.id]))}
            className="hover:text-red-600"
          >
            Xoá
          </button>
        </span>
      </div>

      {picking && (
        <div>
          <TagPicker
            tags={tags}
            current={note.tags[0].id}
            onPick={(tagId) =>
              tagId === note.tags[0].id
                ? setPicking(false)
                : run(() => moveNoteAction(note.id, tagId), () => setPicking(false))
            }
            onCancel={() => setPicking(false)}
          />
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </article>
  );
}
