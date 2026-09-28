import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS, canReorder, defaultSort, renumberConfirmText, filtersToQuery, parseNoteFilters, toListFilter } from '@/lib/notes/filters';

describe('parseNoteFilters', () => {
  it('mặc định', () => {
    expect(parseNoteFilters({})).toEqual(EMPTY_FILTERS);
    expect(EMPTY_FILTERS).toEqual({
      q: '', tagIds: [], sources: [], sort: 'newest', date: '', day: '', month: '', from: '', to: '', limit: 50,
    });
  });

  it('đọc tham số đơn và lặp lại, bỏ giá trị lạ', () => {
    expect(
      parseNoteFilters({ q: ' lich su ', tag: ['2', '3', 'abc', '2'], source: ['web', 'email'], limit: '100' }),
    ).toMatchObject({ q: 'lich su', tagIds: [2, 3], sources: ['web'], limit: 100 });
    expect(parseNoteFilters({ tag: '5', source: 'telegram' })).toMatchObject({ tagIds: [5], sources: ['telegram'] });
  });

  it('kẹp limit', () => {
    expect(parseNoteFilters({ limit: '9999' }).limit).toBe(500);
    expect(parseNoteFilters({ limit: '-3' }).limit).toBe(50);
    expect(parseNoteFilters({ limit: 'x' }).limit).toBe(50);
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
    const f = { ...EMPTY_FILTERS, q: 'y học', tagIds: [2, 3], sources: ['web' as const], limit: 100 };
    const qs = filtersToQuery(f);
    expect(qs).toBe('q=y+h%E1%BB%8Dc&tag=2&tag=3&source=web&limit=100');
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
      limit: 50,
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
  it('đang hiện đủ cả tag', () => {
    expect(renumberConfirmText('Temp', 5, 5)).toBe('Đánh số lại 5 ghi chú trong tag "Temp" theo thứ tự đang hiển thị?');
  });
  it('chỉ hiện một phần → nói rõ phần còn lại đánh tiếp', () => {
    expect(renumberConfirmText('Temp', 3, 10)).toBe(
      'Đánh số lại tag "Temp": 3 ghi chú đang hiện thành #1–#3 theo thứ tự này, 7 ghi chú còn lại đánh tiếp từ #4?',
    );
  });
});
