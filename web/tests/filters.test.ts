import { describe, expect, it } from 'vitest';
import { filtersToQuery, parseNoteFilters } from '@/lib/notes/filters';

describe('parseNoteFilters', () => {
  it('mặc định', () => {
    expect(parseNoteFilters({})).toEqual({ q: '', tagIds: [], sources: [], limit: 50 });
  });

  it('đọc tham số đơn và lặp lại, bỏ giá trị lạ', () => {
    expect(
      parseNoteFilters({ q: ' lich su ', tag: ['2', '3', 'abc', '2'], source: ['web', 'email'], limit: '100' }),
    ).toEqual({ q: 'lich su', tagIds: [2, 3], sources: ['web'], limit: 100 });
    expect(parseNoteFilters({ tag: '5', source: 'telegram' })).toMatchObject({ tagIds: [5], sources: ['telegram'] });
  });

  it('kẹp limit', () => {
    expect(parseNoteFilters({ limit: '9999' }).limit).toBe(500);
    expect(parseNoteFilters({ limit: '-3' }).limit).toBe(50);
    expect(parseNoteFilters({ limit: 'x' }).limit).toBe(50);
  });
});

describe('filtersToQuery', () => {
  it('round-trip và bỏ tham số rỗng', () => {
    const f = { q: 'y học', tagIds: [2, 3], sources: ['web' as const], limit: 100 };
    const qs = filtersToQuery(f);
    expect(qs).toBe('q=y+h%E1%BB%8Dc&tag=2&tag=3&source=web&limit=100');
    const sp = Object.fromEntries(
      [...new URLSearchParams(qs).keys()].map((k) => [k, new URLSearchParams(qs).getAll(k)]),
    );
    expect(parseNoteFilters(sp)).toEqual(f);
    expect(filtersToQuery({ q: '', tagIds: [], sources: [], limit: 50 })).toBe('');
  });
});
