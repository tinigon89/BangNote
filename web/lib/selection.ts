/**
 * Áp trạng thái `select` cho mọi id nằm giữa `anchorId` và `currentId` (tính cả hai đầu) theo thứ tự hiển thị;
 * id ngoài đoạn giữ trạng thái trong `base` (trạng thái lúc bắt đầu kéo). Không sửa `base`.
 */
export function applyRange(
  orderedIds: number[],
  base: ReadonlySet<number>,
  anchorId: number,
  currentId: number,
  select: boolean,
): Set<number> {
  const next = new Set(base);
  const a = orderedIds.indexOf(anchorId);
  const b = orderedIds.indexOf(currentId);
  if (a < 0 || b < 0) return next;
  for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
    if (select) next.add(orderedIds[i]);
    else next.delete(orderedIds[i]);
  }
  return next;
}

/** Các id nằm giữa `a` và `b` (tính cả hai đầu) theo thứ tự `ids`. */
export function idsBetween(ids: number[], a: number, b: number): number[] {
  const i = ids.indexOf(a);
  const j = ids.indexOf(b);
  if (i < 0 || j < 0) return [];
  return ids.slice(Math.min(i, j), Math.max(i, j) + 1);
}
