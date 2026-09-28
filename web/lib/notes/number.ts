/** "#5" cho bài, "#5.3" cho comment thứ 3 của bài 5 (không kèm dấu #). */
export function formatNumber(position: number, sub: number): string {
  return sub > 0 ? `${position}.${sub}` : `${position}`;
}
