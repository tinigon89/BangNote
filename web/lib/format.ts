const rtf = new Intl.RelativeTimeFormat('vi', { numeric: 'always' });

export function formatRelative(date: Date, now = new Date()): string {
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'vừa xong';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, 'hour');
  const days = Math.floor(hours / 24);
  if (days <= 30) return rtf.format(-days, 'day');
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
}
