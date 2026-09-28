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

/** Đưa `fromId` tới vị trí hiện tại của `toId` (kéo sắp xếp). Id lạ → giữ nguyên. */
export function moveItem(ids: number[], fromId: number, toId: number): number[] {
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = ids.filter((id) => id !== fromId);
  next.splice(to, 0, fromId);
  return next;
}
