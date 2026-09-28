import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS, canReorder, defaultSort, isGrouped, renumberConfirmText, filtersToQuery, parseNoteFilters, toListFilter } from '@/lib/notes/filters';

describe('parseNoteFilters', () => {
  it('mặc định', () => {
    expect(parseNoteFilters({})).toEqual(EMPTY_FILTERS);
    expect(EMPTY_FILTERS).toEqual({
      q: '', tagIds: [], sources: [], sort: 'newest', date: '', day: '', month: '', from: '', to: '', page: 1, posts: false,
    });
  });

  it('đọc tham số đơn và lặp lại, bỏ giá trị lạ', () => {
    expect(
      parseNoteFilters({ q: ' lich su ', tag: ['2', '3', 'abc', '2'], source: ['web', 'email'], page: '3', posts: '1' }),
    ).toMatchObject({ q: 'lich su', tagIds: [2, 3], sources: ['web'], page: 3, posts: true });
    expect(parseNoteFilters({ tag: '5', source: 'telegram' })).toMatchObject({ tagIds: [5], sources: ['telegram'] });
  });

  it('page: số nguyên ≥ 1, sai → 1', () => {
    expect(parseNoteFilters({ page: '0' }).page).toBe(1);
    expect(parseNoteFilters({ page: '-3' }).page).toBe(1);
    expect(parseNoteFilters({ page: 'x' }).page).toBe(1);
    expect(parseNoteFilters({ page: '7' }).page).toBe(7);
  });

  it('sort và thời gian: nhận giá trị hợp lệ, bỏ giá trị lạ', () => {
    expect(parseNoteFilters({ sort: 'oldest', date: 'thismonth' })).toMatchObject({ sort: 'oldest', date: 'thismonth' });
    expect(parseNoteFilters({ sort: 'zzz', date: 'forever' })).toMatchObject({ sort: 'newest', date: '' });
    expect(parseNoteFilters({ date: 'custom', from: '2026-09-01', to: '2026-09-15' })).toMatchObject({
      date: 'custom', from: '2026-09-01', to: '2026-09-15',
    });
    expect(parseNoteFilters({ date: 'day', day: '2026-09-27' }).day).toBe('2026-09-27');
    expect(parseNoteFilters({ date: 'month', month: '2026-09' }).month).toBe('2026-09');
  });

  it('giá trị ngày của chế độ khác bị bỏ (không lọt vào URL)', () => {
    expect(parseNoteFilters({ date: 'today', from: '2026-09-01', day: '2026-09-02' })).toMatchObject({ from: '', day: '' });
  });
});

describe('filtersToQuery', () => {
  it('round-trip và bỏ tham số rỗng/mặc định', () => {
    const f = { ...EMPTY_FILTERS, q: 'y học', tagIds: [2, 3], sources: ['web' as const], page: 2, posts: true };
    const qs = filtersToQuery(f);
    expect(qs).toBe('q=y+h%E1%BB%8Dc&tag=2&tag=3&source=web&posts=1&page=2');
    const sp = Object.fromEntries([...new URLSearchParams(qs).keys()].map((k) => [k, new URLSearchParams(qs).getAll(k)]));
    expect(parseNoteFilters(sp)).toEqual(f);
    expect(filtersToQuery(EMPTY_FILTERS)).toBe('');
  });

  it('ghi sort và thời gian', () => {
    const f = { ...EMPTY_FILTERS, sort: 'updated' as const, date: 'custom' as const, from: '2026-09-01', to: '' };
    expect(filtersToQuery(f)).toBe('sort=updated&date=custom&from=2026-09-01');
    expect(parseNoteFilters(Object.fromEntries(new URLSearchParams(filtersToQuery(f))))).toEqual(f);
  });
});

describe('toListFilter', () => {
  it('chuyển sang bộ lọc của listNotes, tính khoảng thời gian theo giờ VN', () => {
    const now = new Date('2026-09-27T03:00:00Z');
    const f = { ...EMPTY_FILTERS, q: 'x', tagIds: [2], sort: 'oldest' as const, date: 'today' as const };
    expect(toListFilter(f, now)).toEqual({
      q: 'x',
      tagIds: [2],
      sources: [],
      sort: 'oldest',
      createdRange: { start: new Date('2026-09-27T00:00:00+07:00'), end: new Date('2026-09-28T00:00:00+07:00') },
    });
    expect(toListFilter(EMPTY_FILTERS, now).createdRange).toBeNull();
  });
});

describe('sort mặc định', () => {
  it('lọc đúng 1 tag → Theo số #; còn lại → Mới nhất; sort trên URL luôn thắng', () => {
    expect(defaultSort([2])).toBe('position');
    expect(defaultSort([])).toBe('newest');
    expect(defaultSort([2, 3])).toBe('newest');
    expect(parseNoteFilters({ tag: '2' }).sort).toBe('position');
    expect(parseNoteFilters({ tag: '2', sort: 'newest' }).sort).toBe('newest');
    expect(parseNoteFilters({ sort: 'position' }).sort).toBe('position');
  });

  it('filtersToQuery bỏ sort khi bằng mặc định của bộ lọc đó, giữ khi khác', () => {
    expect(filtersToQuery({ ...EMPTY_FILTERS, tagIds: [2], sort: 'position' })).toBe('tag=2');
    expect(filtersToQuery({ ...EMPTY_FILTERS, tagIds: [2], sort: 'newest' })).toBe('tag=2&sort=newest');
  });
});

describe('canReorder', () => {
  it('chỉ khi lọc đúng 1 tag, sort theo số và không có tìm kiếm / nguồn / thời gian', () => {
    const base = { ...EMPTY_FILTERS, tagIds: [2], sort: 'position' as const };
    expect(canReorder(base)).toBe(true);
    expect(canReorder({ ...base, sort: 'newest' })).toBe(false);
    expect(canReorder({ ...base, tagIds: [2, 3] })).toBe(false);
    expect(canReorder({ ...base, q: 'x' })).toBe(false);
    expect(canReorder({ ...base, sources: ['web'] })).toBe(false);
    expect(canReorder({ ...base, date: 'today' })).toBe(false);
  });
});

describe('renumberConfirmText', () => {
  it('nói rõ toàn tag, theo sort nào', () => {
    expect(renumberConfirmText('Temp', 18, 'Cũ nhất')).toBe(
      'Đánh số lại toàn bộ 18 ghi chú trong tag "Temp" theo "Cũ nhất"? Bài đánh #1…, comment trong mỗi bài .1, .2…',
    );
  });
});

describe('isGrouped', () => {
  it('đúng 1 tag + sort theo số', () => {
    expect(isGrouped({ ...EMPTY_FILTERS, tagIds: [2], sort: 'position' })).toBe(true);
    expect(isGrouped({ ...EMPTY_FILTERS, tagIds: [2], sort: 'newest' })).toBe(false);
    expect(isGrouped({ ...EMPTY_FILTERS, tagIds: [2, 3], sort: 'position' })).toBe(false);
  });
});
