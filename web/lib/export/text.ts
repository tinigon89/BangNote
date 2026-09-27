import { vnDateString, vnDateTimeString } from '@/lib/notes/dates';
import type { Note } from '@/lib/notes/types';

export const SEPARATOR = '-'.repeat(40);

export function noteHeader(note: Note): string {
  return [`#${note.id}`, note.tags.map((t) => t.name).join(', '), vnDateTimeString(note.createdAt), note.sourceUrl]
    .filter(Boolean)
    .join(' · ');
}

export function formatNotesTxt(notes: Note[]): string {
  if (!notes.length) return '';
  return notes.map((n) => `${noteHeader(n)}\n${n.content}\n`).join(`\n${SEPARATOR}\n\n`);
}

/** Nội dung dùng cho nút Copy nhiều ghi chú — chỉ nội dung, cách nhau một dòng trống. */
export function joinForCopy(notes: Pick<Note, 'content'>[]): string {
  return notes.map((n) => n.content).join('\n\n');
}

export function exportFilename(ext: 'txt' | 'docx', now = new Date()): string {
  return `bangnote-${vnDateString(now)}.${ext}`;
}
