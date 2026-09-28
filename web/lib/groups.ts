import type { Note } from '@/lib/notes/types';

export interface NoteGroup {
  /** Id đại diện nhóm: bài, hoặc comment đầu nếu nhóm mất bài. */
  lead: number;
  position: number;
  post: Note | null;
  comments: Note[];
}

/** Gom danh sách đã sắp theo (position, sub) thành nhóm bài + comment, giữ thứ tự xuất hiện. */
export function groupNotes(list: Note[]): NoteGroup[] {
  const out: NoteGroup[] = [];
  const byKey = new Map<string, NoteGroup>();
  for (const note of list) {
    const key = `${note.tags[0].id}:${note.position}`;
    let group = byKey.get(key);
    if (!group) {
      group = { lead: note.id, position: note.position, post: null, comments: [] };
      byKey.set(key, group);
      out.push(group);
    }
    if (note.sub === 0 && !group.post) {
      group.post = note;
      group.lead = note.id;
    } else group.comments.push(note);
  }
  return out;
}

/** Tick/kéo chọn trúng thẻ bài → áp cùng trạng thái cho mọi comment của bài (kể cả đang thu gọn). */
export function expandSelection(next: Set<number>, changed: number[], select: boolean, groups: NoteGroup[]): Set<number> {
  const out = new Set(next);
  const byPost = new Map(groups.filter((g) => g.post).map((g) => [g.post!.id, g.comments.map((c) => c.id)]));
  for (const id of changed) {
    for (const c of byPost.get(id) ?? []) {
      if (select) out.add(c);
      else out.delete(c);
    }
  }
  return out;
}
