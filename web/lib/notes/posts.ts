import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { notes, tags, type Source } from '@/lib/db/schema';
import type { DB } from '@/lib/db/types';
import { DomainError } from './errors';
import type { Sort } from './notes';
import { lockTag, nextPosition, resolveTag, tagColumns, type Placement } from './tags';

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

type NoteRef = { id: number; tagId: number; position: number; sub: number };
const refColumns = { id: notes.id, tagId: notes.tagId, position: notes.position, sub: notes.sub };

async function getRef(db: DB, id: number): Promise<NoteRef> {
  const [row] = await db.select(refColumns).from(notes).where(eq(notes.id, id));
  if (!row) throw new DomainError('not_found', 'Không tìm thấy ghi chú');
  return row;
}

/** Ghi chú đứng đầu nhóm (sub, id nhỏ nhất): bài, hoặc comment đầu của nhóm mất bài. */
async function isGroupLead(db: DB, ref: NoteRef): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notes)
    .where(
      and(
        eq(notes.tagId, ref.tagId),
        eq(notes.position, ref.position),
        sql`(${notes.sub}, ${notes.id}) < (${ref.sub}::int, ${ref.id}::int)`,
      ),
    );
  return row.n === 0;
}

/** Khoá tag của ghi chú rồi mới đọc lại, để thao tác bấm đúp không chạy trên dữ liệu cũ. */
async function lockAndRead(db: DB, id: number): Promise<NoteRef> {
  const first = await getRef(db, id);
  await lockTag(db, first.tagId);
  return getRef(db, id);
}

async function placementOf(db: DB, id: number): Promise<Placement> {
  const [row] = await db
    .select({ position: notes.position, sub: notes.sub, tag: tagColumns })
    .from(notes)
    .innerJoin(tags, eq(tags.id, notes.tagId))
    .where(eq(notes.id, id));
  if (!row) throw new DomainError('not_found', 'Không tìm thấy ghi chú');
  return row;
}

/**
 * Chuyển ghi chú sang tag khác theo từng nhóm nguồn (thứ tự xuất hiện trong `ids`):
 * có chọn bài của nhóm → các ghi chú được chọn thành nhóm mới cuối tag đích;
 * chỉ chọn comment → comment nối tiếp bài cuối tag đích (tag rỗng → ghi chú đầu thành bài #1).
 */
export async function moveNotes(db: DB, ids: number[], tagId: number | null): Promise<void> {
  await db.transaction(async (tx) => {
    const target = await resolveTag(tx, tagId);
    await lockTag(tx, target.id);
    const unique = [...new Set(ids)];
    if (!unique.length) return;
    const rows = await tx.select(refColumns).from(notes).where(inArray(notes.id, unique));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const groups = new Map<string, NoteRef[]>();
    for (const id of unique) {
      const r = byId.get(id);
      if (!r || r.tagId === target.id) continue;
      const key = `${r.tagId}:${r.position}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    for (const members of groups.values()) {
      members.sort((a, b) => a.sub - b.sub || a.id - b.id);
      const asPost = members[0].sub === 0;
      const slot = slotAfter(await lastAnchor(tx, target.id), asPost);
      for (const [i, m] of members.entries()) {
        await tx
          .update(notes)
          .set({ tagId: target.id, position: slot.position, sub: slot.sub + i, updatedAt: new Date() })
          .where(eq(notes.id, m.id));
      }
    }
  });
}

export async function moveNote(db: DB, noteId: number, tagId: number | null): Promise<Placement> {
  return db.transaction(async (tx) => {
    await getRef(tx, noteId);
    await moveNotes(tx, [noteId], tagId);
    return placementOf(tx, noteId);
  });
}

/** 📌 Bài mới: ghi chú (và các comment sau nó trong bài) thành bài mới cuối tag. Đã là bài → giữ nguyên. */
export async function splitPost(db: DB, noteId: number): Promise<Placement> {
  return db.transaction(async (tx) => {
    const note = await lockAndRead(tx, noteId);
    if (note.sub === 0) return placementOf(tx, noteId);
    const position = await nextPosition(tx, note.tagId);
    await tx.execute(sql`
      UPDATE notes n SET position = ${position}::int, sub = r.rn::int - 1
      FROM (SELECT id, row_number() OVER (ORDER BY sub, id) AS rn FROM notes
            WHERE tag_id = ${note.tagId}::int AND position = ${note.position}::int AND sub >= ${note.sub}::int) r
      WHERE n.id = r.id`);
    return placementOf(tx, noteId);
  });
}

/** ↳ Gộp vào bài trước: cả nhóm của ghi chú thành các comment nối tiếp nhóm đứng ngay trước. */
export async function mergeIntoPrevious(db: DB, noteId: number): Promise<Placement> {
  return db.transaction(async (tx) => {
    const note = await lockAndRead(tx, noteId);
    if (!(await isGroupLead(tx, note))) {
      throw new DomainError('invalid', 'Chỉ gộp được cả bài — bấm ↳ trên bài, không phải trên comment');
    }
    const [prev] = await tx
      .select({ position: sql<number | null>`max(${notes.position})::int` })
      .from(notes)
      .where(and(eq(notes.tagId, note.tagId), lt(notes.position, note.position)));
    if (prev?.position == null) throw new DomainError('invalid', 'Không có bài nào trước');
    const [base] = await tx
      .select({ sub: sql<number>`max(${notes.sub})::int` })
      .from(notes)
      .where(and(eq(notes.tagId, note.tagId), eq(notes.position, prev.position)));
    await tx.execute(sql`
      UPDATE notes n SET position = ${prev.position}::int, sub = ${base.sub}::int + r.rn::int
      FROM (SELECT id, row_number() OVER (ORDER BY sub, id) AS rn FROM notes
            WHERE tag_id = ${note.tagId}::int AND position = ${note.position}::int) r
      WHERE n.id = r.id`);
    return placementOf(tx, noteId);
  });
}

/**
 * Đánh số lại toàn tag theo `sort`: nhóm xếp theo ghi chú đầu của nhóm theo sort đó rồi đánh 1…n;
 * trong nhóm giữ thứ tự sub, đánh 0, 1, 2… (nhóm mất bài → comment đầu thành bài).
 */
export async function renumberTag(db: DB, tagId: number, sort: Sort = 'position'): Promise<void> {
  await db.transaction(async (tx) => {
    await lockTag(tx, tagId);
    const rows = await tx
      .select({ id: notes.id, position: notes.position, updatedAt: notes.updatedAt })
      .from(notes)
      .where(eq(notes.tagId, tagId))
      .orderBy(asc(notes.position), asc(notes.sub), asc(notes.id));
    if (!rows.length) return;
    const groups = new Map<number, typeof rows>();
    for (const r of rows) {
      if (!groups.has(r.position)) groups.set(r.position, []);
      groups.get(r.position)!.push(r);
    }
    const key = (g: typeof rows): number =>
      sort === 'oldest'
        ? Math.min(...g.map((r) => r.id))
        : sort === 'newest'
          ? -Math.max(...g.map((r) => r.id))
          : sort === 'updated'
            ? -Math.max(...g.map((r) => r.updatedAt.getTime()))
            : g[0].position;
    const list = [...groups.values()].sort((a, b) => key(a) - key(b) || a[0].position - b[0].position);
    const ids: number[] = [];
    const positions: number[] = [];
    const subs: number[] = [];
    list.forEach((g, i) =>
      g.forEach((r, j) => {
        ids.push(r.id);
        positions.push(i + 1);
        subs.push(j);
      }),
    );
    await tx.execute(sql`
      UPDATE notes n SET position = v.pos, sub = v.sub
      FROM unnest(${sql.param(ids)}::int[], ${sql.param(positions)}::int[], ${sql.param(subs)}::int[]) AS v(id, pos, sub)
      WHERE n.id = v.id`);
  });
}

/** Kéo thả: đầu nhóm → cả nhóm tới trước/sau nhóm của `targetId`; comment → đổi chỗ trong nhóm của nó (khác nhóm → bỏ qua). */
export async function dropNote(db: DB, movingId: number, targetId: number, after: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    const moving = await lockAndRead(tx, movingId);
    const target = await getRef(tx, targetId);
    if (moving.tagId !== target.tagId) throw new DomainError('invalid', 'Chỉ sắp xếp được trong cùng một tag');
    // Đầu nhóm (bài, hoặc comment đầu của nhóm mất bài) → di chuyển cả nhóm
    if (await isGroupLead(tx, moving)) await reorderGroups(tx, moving.tagId, moving.position, target.position, after);
    else if (target.position === moving.position) await reorderComments(tx, moving, target, after);
  });
}

async function reorderGroups(db: DB, tagId: number, from: number, to: number, after: boolean): Promise<void> {
  if (from === to) return;
  const rows = await db
    .selectDistinct({ position: notes.position })
    .from(notes)
    .where(eq(notes.tagId, tagId))
    .orderBy(asc(notes.position));
  const order = rows.map((r) => r.position).filter((p) => p !== from);
  const index = order.indexOf(to);
  if (index < 0) return;
  order.splice(after ? index + 1 : index, 0, from);
  const news = order.map((_, i) => i + 1);
  await db.execute(sql`
    UPDATE notes n SET position = m.new
    FROM unnest(${sql.param(order)}::int[], ${sql.param(news)}::int[]) AS m(old, new)
    WHERE n.tag_id = ${tagId}::int AND n.position = m.old`);
}

async function reorderComments(db: DB, moving: NoteRef, target: NoteRef, after: boolean): Promise<void> {
  const rows = await db
    .select({ id: notes.id, sub: notes.sub })
    .from(notes)
    .where(and(eq(notes.tagId, moving.tagId), eq(notes.position, moving.position)))
    .orderBy(asc(notes.sub), asc(notes.id));
  const comments = rows.filter((r) => r.sub > 0 && r.id !== moving.id).map((r) => r.id);
  let index: number;
  if (target.sub === 0) index = 0;
  else {
    const at = comments.indexOf(target.id);
    if (at < 0) return;
    index = after ? at + 1 : at;
  }
  comments.splice(index, 0, moving.id);
  const subs = comments.map((_, i) => i + 1);
  await db.execute(sql`
    UPDATE notes n SET sub = v.sub
    FROM unnest(${sql.param(comments)}::int[], ${sql.param(subs)}::int[]) AS v(id, sub)
    WHERE n.id = v.id`);
}
