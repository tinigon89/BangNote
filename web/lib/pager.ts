/** Trang hiển thị trên thanh phân trang: đầu, cuối, hiện tại ±2; khoảng hở → "…". */
export function pageItems(page: number, pageCount: number): (number | '…')[] {
  const keep = new Set([1, pageCount]);
  for (let p = page - 2; p <= page + 2; p++) if (p >= 1 && p <= pageCount) keep.add(p);
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
}
