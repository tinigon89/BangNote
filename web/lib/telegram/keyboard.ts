import { formatNumber } from '@/lib/notes/number';
import type { Tag } from '@/lib/notes/types';

export type InlineButton = { text: string; callback_data: string };
export type InlineKeyboard = { inline_keyboard: InlineButton[][] };

export type CallbackAction =
  | { kind: 'toggle'; noteId: number; tagId: number }
  | { kind: 'delete'; noteId: number }
  | { kind: 'newpost'; noteId: number };

const MAX_TAG_BUTTONS = 30;

export function buildNoteKeyboard(noteId: number, allTags: Tag[], selectedIds: number[]): InlineKeyboard {
  const selected = new Set(selectedIds);
  const buttons = allTags.slice(0, MAX_TAG_BUTTONS).map((tag) => ({
    text: `${selected.has(tag.id) ? '✓ ' : ''}${tag.name}`,
    callback_data: `t:${noteId}:${tag.id}`,
  }));
  const rows: InlineButton[][] = [];
  for (let i = 0; i < buttons.length; i += 3) rows.push(buttons.slice(i, i + 3));
  rows.push([
    { text: '📌 Bài mới', callback_data: `n:${noteId}` },
    { text: '🗑 Xoá', callback_data: `d:${noteId}` },
  ]);
  return { inline_keyboard: rows };
}

export function parseCallbackData(data: string): CallbackAction | null {
  const toggle = /^t:(\d+):(\d+)$/.exec(data);
  if (toggle) return { kind: 'toggle', noteId: Number(toggle[1]), tagId: Number(toggle[2]) };
  const del = /^d:(\d+)$/.exec(data);
  if (del) return { kind: 'delete', noteId: Number(del[1]) };
  const newPost = /^n:(\d+)$/.exec(data);
  if (newPost) return { kind: 'newpost', noteId: Number(newPost[1]) };
  return null;
}

export const savedLabel = (tagName: string, position: number, sub = 0) => `${tagName} #${formatNumber(position, sub)}`;
