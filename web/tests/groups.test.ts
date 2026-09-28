import { describe, expect, it } from 'vitest';
import { expandSelection, groupNotes } from '@/lib/groups';
import type { Note, Tag } from '@/lib/notes/types';
import { idsBetween } from '@/lib/selection';

const TAG: Tag = { id: 1, name: 'Temp', color: '#94a3b8', isDefault: true };
const n = (id: number, position: number, sub: number): Note => ({
  id, content: `n${id}`, source: 'web', sourceUrl: null, sourceTitle: null,
  createdAt: new Date(0), updatedAt: new Date(0), tags: [TAG], position, sub,
});

describe('groupNotes', () => {
  it('gom theo bài, giữ thứ tự; nhóm mất bài có lead là comment đầu', () => {
    const groups = groupNotes([n(1, 1, 0), n(2, 1, 1), n(3, 1, 2), n(5, 2, 1), n(6, 3, 0)]);
    expect(groups.map((g) => [g.lead, g.post?.id ?? null, g.comments.map((c) => c.id)])).toEqual([
      [1, 1, [2, 3]],
      [5, null, [5]],
      [6, 6, []],
    ]);
  });
});

describe('expandSelection', () => {
  const groups = groupNotes([n(1, 1, 0), n(2, 1, 1), n(3, 1, 2), n(4, 2, 0)]);
  it('tick bài → chọn cả comment (kể cả đang thu gọn); bỏ tick → bỏ cả nhóm', () => {
    expect([...expandSelection(new Set([1]), [1], true, groups)].sort()).toEqual([1, 2, 3]);
    expect([...expandSelection(new Set([2, 4]), [1], false, groups)].sort()).toEqual([4]);
  });
  it('tick comment → chỉ comment đó', () => {
    expect([...expandSelection(new Set([2]), [2], true, groups)]).toEqual([2]);
  });
});

describe('idsBetween', () => {
  it('đoạn giữa hai id theo thứ tự, hai chiều; id lạ → rỗng', () => {
    expect(idsBetween([1, 2, 3, 4], 2, 4)).toEqual([2, 3, 4]);
    expect(idsBetween([1, 2, 3, 4], 4, 2)).toEqual([2, 3, 4]);
    expect(idsBetween([1, 2], 9, 2)).toEqual([]);
  });
});
