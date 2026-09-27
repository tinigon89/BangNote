/** Text đọc từ trang giữ xuống dòng; `selectionText` của menu thì gộp thành một dòng — chỉ dùng làm dự phòng. */
export function pickText(scripted, fallback) {
  if (typeof scripted === 'string' && scripted.trim()) return scripted;
  return fallback ?? '';
}
