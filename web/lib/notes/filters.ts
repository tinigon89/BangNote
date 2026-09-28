import { SOURCES, type Source } from '@/lib/db/schema';
import { DATE_MODES, resolveDateRange, type DateMode } from './dates';
import { SORTS, type ListNotesFilter, type Sort } from './notes';

export interface NoteFilters {
  q: string;
  tagIds: number[];
  sources: Source[];
  sort: Sort;
  date: DateMode | '';
  /** Chỉ có giá trị khi date = 'day' (YYYY-MM-DD). */
  day: string;
  /** Chỉ có giá trị khi date = 'month' (YYYY-MM). */
  month: string;
  /** Chỉ có giá trị khi date = 'custom' (YYYY-MM-DD, có thể trống). */
  from: string;
  to: string;
  /** Trang hiện tại (≥ 1). */
  page: number;
  /** Chế độ nhóm: thu gọn hết comment ("Chỉ hiện bài viết"). */
  posts: boolean;
}

export const POSTS_PER_PAGE = 20;
export const NOTES_PER_PAGE = 50;

export const EMPTY_FILTERS: NoteFilters = {
  q: '',
  tagIds: [],
  sources: [],
  sort: 'newest',
  date: '',
  day: '',
  month: '',
  from: '',
  to: '',
  page: 1,
  posts: false,
};

export const SOURCE_LABELS: Record<Source, string> = {
  telegram: 'Telegram',
  extension: 'Extension',
  widget: 'Widget',
  web: 'Web',
};

export const SORT_LABELS: Record<Sort, string> = {
  newest: 'Mới nhất',
  oldest: 'Cũ nhất',
  updated: 'Mới sửa gần đây',
  position: 'Theo số #',
};

/** Lọc đúng 1 tag → xem theo số thứ tự của tag; còn lại → mới nhất. */
export function defaultSort(tagIds: number[]): Sort {
  return tagIds.length === 1 ? 'position' : 'newest';
}

/**
 * Kéo sắp xếp chỉ khi đang xem trọn một tag theo số: lọc thêm (tìm kiếm, nguồn, thời gian) sẽ ẩn bớt ghi chú,
 * và đánh số lại theo phần đang hiện sẽ xáo trộn số của các ghi chú bị ẩn.
 */
export function canReorder(f: NoteFilters): boolean {
  return f.tagIds.length === 1 && f.sort === 'position' && !f.q && !f.sources.length && !f.date;
}

/** Hiện theo nhóm bài/comment: đúng 1 tag + sort theo số. */
export function isGrouped(f: NoteFilters): boolean {
  return f.tagIds.length === 1 && f.sort === 'position';
}

/** Câu hỏi xác nhận nút "Đánh số lại" (chạy trên toàn tag). */
export function renumberConfirmText(tagName: string, total: number, sortLabel: string): string {
  return `Đánh số lại toàn bộ ${total} ghi chú trong tag "${tagName}" theo "${sortLabel}"? Bài đánh #1…, comment trong mỗi bài .1, .2…`;
}

type SearchParams = Record<string, string | string[] | undefined>;

const all = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const first = (v: string | string[] | undefined) => (all(v)[0] ?? '').trim();
const oneOf = <T extends string>(list: readonly T[], v: string): T | undefined =>
  (list as readonly string[]).includes(v) ? (v as T) : undefined;

export function parseNoteFilters(sp: SearchParams): NoteFilters {
  const tagIds = [...new Set(all(sp.tag).filter((s) => /^\d+$/.test(s)).map(Number))].filter((n) => n > 0);
  const sources = [...new Set(all(sp.source))].filter((s): s is Source => (SOURCES as readonly string[]).includes(s));
  const rawPage = Number(all(sp.page)[0]);
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const date = oneOf(DATE_MODES, first(sp.date)) ?? '';
  return {
    q: first(sp.q),
    tagIds,
    sources,
    sort: oneOf(SORTS, first(sp.sort)) ?? defaultSort(tagIds),
    date,
    day: date === 'day' ? first(sp.day) : '',
    month: date === 'month' ? first(sp.month) : '',
    from: date === 'custom' ? first(sp.from) : '',
    to: date === 'custom' ? first(sp.to) : '',
    page,
    posts: first(sp.posts) === '1',
  };
}

export function filtersToQuery(f: NoteFilters): string {
  const params = new URLSearchParams();
  if (f.q) params.set('q', f.q);
  for (const id of f.tagIds) params.append('tag', String(id));
  for (const s of f.sources) params.append('source', s);
  if (f.sort !== defaultSort(f.tagIds)) params.set('sort', f.sort);
  if (f.date) params.set('date', f.date);
  for (const key of ['day', 'month', 'from', 'to'] as const) if (f[key]) params.set(key, f[key]);
  if (f.posts) params.set('posts', '1');
  if (f.page > 1) params.set('page', String(f.page));
  return params.toString();
}

export function toListFilter(f: NoteFilters, now = new Date()): ListNotesFilter {
  return {
    q: f.q,
    tagIds: f.tagIds,
    sources: f.sources,
    sort: f.sort,
    createdRange: resolveDateRange(f, now),
  };
}
