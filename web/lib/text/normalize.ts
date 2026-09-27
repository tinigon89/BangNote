/** Khoá so khớp tên tag / hashtag: bỏ dấu, đ→d, lowercase, bỏ khoảng trắng và `_`. */
export function normalizeKey(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[\s_]+/g, '');
}
