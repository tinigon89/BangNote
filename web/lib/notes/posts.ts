import { desc, eq } from 'drizzle-orm';
import { notes, type Source } from '@/lib/db/schema';
import type { DB } from '@/lib/db/types';

const ID_PARAMS = ['fbid', 'id', 'story_fbid', 'v'] as const;

/** Khoá định danh bài của một link, để so "cùng bài" giữa các lần lưu từ extension. */
export function postKey(url: string): string {
  const raw = url.trim();
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
  const path = u.pathname.replace(/\/+$/, '');
  const keep = ID_PARAMS.filter((k) => u.searchParams.has(k)).map((k) => `${k}=${u.searchParams.get(k)}`);
  return `${host}${path}${keep.length ? `?${keep.join('&')}` : ''}`;
}

export interface Anchor {
  position: number;
  sub: number;
  source: Source;
  sourceUrl: string | null;
}

export interface Slot {
  position: number;
  sub: number;
}

export interface NewNoteHints {
  source: Source;
  sourceUrl?: string | null;
  newPost?: boolean;
}

/** Ghi chú mới có mở bài mới không, so với ghi chú mốc (ghi chú thêm gần nhất vào bài cuối). */
export function shouldStartPost(anchor: Anchor | null, next: NewNoteHints): boolean {
  if (!anchor || next.newPost) return true;
  if (anchor.source !== next.source) return true;
  return !!anchor.sourceUrl && !!next.sourceUrl && postKey(anchor.sourceUrl) !== postKey(next.sourceUrl);
}

export function slotAfter(anchor: Anchor | null, asPost: boolean): Slot {
  if (!anchor || asPost) return { position: (anchor?.position ?? 0) + 1, sub: 0 };
  return { position: anchor.position, sub: anchor.sub + 1 };
}

/** Ghi chú mốc của tag: bài cuối (position lớn nhất), comment cuối (sub lớn nhất). */
export async function lastAnchor(db: DB, tagId: number): Promise<Anchor | null> {
  const [row] = await db
    .select({ position: notes.position, sub: notes.sub, source: notes.source, sourceUrl: notes.sourceUrl })
    .from(notes)
    .where(eq(notes.tagId, tagId))
    .orderBy(desc(notes.position), desc(notes.sub), desc(notes.id))
    .limit(1);
  return row ?? null;
}
