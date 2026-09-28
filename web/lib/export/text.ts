import { vnDateString, vnDateTimeString } from '@/lib/notes/dates';
import type { Note } from '@/lib/notes/types';

export interface ExportOptions {
  /** Kèm `#position` (số trong tag). */
  number: boolean;
  /** Kèm tag, ngày giờ, link nguồn. */
  detail: boolean;
}

export const FULL_EXPORT: ExportOptions = { number: true, detail: true };

/** Dòng đầu của ghi chú khi xuất; chuỗi rỗng nếu không bật phần nào. */
export function noteHeader(note: Note, opts: ExportOptions = FULL_EXPORT): string {
  const parts = [
    opts.number ? `#${note.position}` : '',
    ...(opts.detail ? [note.tags.map((t) => t.name).join(', '), vnDateTimeString(note.createdAt), note.sourceUrl ?? ''] : []),
  ];
  return parts.filter(Boolean).join(' · ');
}

/** Mỗi ghi chú: [dòng đầu] + nội dung; các ghi chú cách nhau đúng một dòng trống. */
export function formatNotesTxt(notes: Note[], opts: ExportOptions = FULL_EXPORT): string {
  if (!notes.length) return '';
  const blocks = notes.map((n) => {
    const header = noteHeader(n, opts);
    return header ? `${header}\n${n.content}` : n.content;
  });
  return `${blocks.join('\n\n')}\n`;
}

/** Nội dung dùng cho nút Copy nhiều ghi chú — chỉ nội dung, cách nhau một dòng trống. */
export function joinForCopy(notes: Pick<Note, 'content'>[]): string {
  return notes.map((n) => n.content).join('\n\n');
}

export function exportFilename(ext: 'txt' | 'docx', now = new Date()): string {
  return `bangnote-${vnDateString(now)}.${ext}`;
}
