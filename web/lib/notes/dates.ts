/** Mốc thời gian theo giờ Việt Nam (UTC+7, không có giờ mùa hè). */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export const DATE_PRESETS = ['today', 'yesterday', '7d', '30d', 'thismonth', 'lastmonth'] as const;
export const DATE_MODES = [...DATE_PRESETS, 'day', 'month', 'custom'] as const;
export type DateMode = (typeof DATE_MODES)[number];

export const DATE_LABELS: Record<DateMode, string> = {
  today: 'Hôm nay',
  yesterday: 'Hôm qua',
  '7d': '7 ngày qua',
  '30d': '30 ngày qua',
  thismonth: 'Tháng này',
  lastmonth: 'Tháng trước',
  day: 'Chọn ngày…',
  month: 'Chọn tháng…',
  custom: 'Tuỳ chọn…',
};

export interface DateFilterInput {
  date: DateMode | '';
  day?: string;
  month?: string;
  from?: string;
  to?: string;
}

/** `start` tính, `end` không tính; một đầu có thể mở (null). */
export interface DateRange {
  start: Date | null;
  end: Date | null;
}

/** 00:00 giờ VN của ngày (y, m 1-based, d); Date.UTC tự xử lý tràn tháng/năm. */
const vnMidnight = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d) - VN_OFFSET_MS);

function vnParts(now: Date) {
  const shifted = new Date(now.getTime() + VN_OFFSET_MS);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() };
}

export function vnDateString(date: Date): string {
  return new Date(date.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' hợp lệ (kể cả ngày có thật trong tháng) → [y, m, d]. */
function parseDay(s: string | undefined): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!match) return null;
  const [y, m, d] = match.slice(1).map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d ? [y, m, d] : null;
}

function parseMonth(s: string | undefined): [number, number] | null {
  const match = /^(\d{4})-(\d{2})$/.exec(s ?? '');
  if (!match) return null;
  const [y, m] = match.slice(1).map(Number);
  return m >= 1 && m <= 12 ? [y, m] : null;
}

export function resolveDateRange(input: DateFilterInput, now = new Date()): DateRange | null {
  const { y, m, d } = vnParts(now);
  switch (input.date) {
    case 'today':
      return { start: vnMidnight(y, m, d), end: vnMidnight(y, m, d + 1) };
    case 'yesterday':
      return { start: vnMidnight(y, m, d - 1), end: vnMidnight(y, m, d) };
    case '7d':
      return { start: vnMidnight(y, m, d - 6), end: vnMidnight(y, m, d + 1) };
    case '30d':
      return { start: vnMidnight(y, m, d - 29), end: vnMidnight(y, m, d + 1) };
    case 'thismonth':
      return { start: vnMidnight(y, m, 1), end: vnMidnight(y, m + 1, 1) };
    case 'lastmonth':
      return { start: vnMidnight(y, m - 1, 1), end: vnMidnight(y, m, 1) };
    case 'day': {
      const day = parseDay(input.day);
      return day ? { start: vnMidnight(...day), end: vnMidnight(day[0], day[1], day[2] + 1) } : null;
    }
    case 'month': {
      const month = parseMonth(input.month);
      return month ? { start: vnMidnight(month[0], month[1], 1), end: vnMidnight(month[0], month[1] + 1, 1) } : null;
    }
    case 'custom': {
      let from = parseDay(input.from);
      let to = parseDay(input.to);
      if (!from && !to) return null;
      if (from && to && vnMidnight(...from) > vnMidnight(...to)) [from, to] = [to, from];
      return {
        start: from ? vnMidnight(...from) : null,
        end: to ? vnMidnight(to[0], to[1], to[2] + 1) : null,
      };
    }
    default:
      return null;
  }
}

/** 'dd/mm/yyyy HH:MM' theo giờ VN. */
export function vnDateTimeString(date: Date): string {
  const s = new Date(date.getTime() + VN_OFFSET_MS).toISOString();
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}`;
}
