'use client';

import { useState } from 'react';
import { DATE_LABELS, DATE_MODES, DATE_PRESETS, type DateMode } from '@/lib/notes/dates';
import { SORT_LABELS, defaultSort, type NoteFilters } from '@/lib/notes/filters';
import { SORTS } from '@/lib/notes/notes';

const submit = (el: HTMLElement) => el.closest('form')?.requestSubmit();
const inputClass = 'rounded-lg border px-2 py-1';

/**
 * "Mặc định" gửi `sort=` rỗng → server tự chọn (Theo số # khi lọc 1 tag, còn lại Mới nhất),
 * nên đổi tag trong form không bị kẹt sort cũ trên URL.
 */
export function SortSelect({ filters }: { filters: NoteFilters }) {
  const value = filters.sort === defaultSort(filters.tagIds) ? '' : filters.sort;
  return (
    <select name="sort" defaultValue={value} onChange={(e) => submit(e.currentTarget)} className={inputClass} aria-label="Sắp xếp">
      <option value="">Mặc định</option>
      {SORTS.map((s) => (
        <option key={s} value={s}>
          {SORT_LABELS[s]}
        </option>
      ))}
    </select>
  );
}

/** Mốc có sẵn tự lọc ngay; "Chọn ngày/tháng/Tuỳ chọn" hiện ô nhập và lọc khi nhập xong. */
export function DateFilter({ filters }: { filters: NoteFilters }) {
  const [mode, setMode] = useState<DateMode | ''>(filters.date);
  const isPreset = (m: string) => (DATE_PRESETS as readonly string[]).includes(m);

  return (
    <span className="flex flex-wrap items-center gap-2">
      <select
        name="date"
        value={mode}
        onChange={(e) => {
          const next = e.currentTarget.value as DateMode | '';
          setMode(next);
          if (next === '' || isPreset(next)) submit(e.currentTarget);
        }}
        className={inputClass}
        aria-label="Thời gian"
      >
        <option value="">Mọi thời gian</option>
        {DATE_MODES.map((m) => (
          <option key={m} value={m}>
            {DATE_LABELS[m]}
          </option>
        ))}
      </select>
      {mode === 'day' && (
        <input type="date" name="day" defaultValue={filters.day} onChange={(e) => submit(e.currentTarget)} className={inputClass} aria-label="Ngày" />
      )}
      {mode === 'month' && (
        <input type="month" name="month" defaultValue={filters.month} onChange={(e) => submit(e.currentTarget)} className={inputClass} aria-label="Tháng" />
      )}
      {mode === 'custom' && (
        <>
          <input type="date" name="from" defaultValue={filters.from} className={inputClass} aria-label="Từ ngày" />
          <span className="text-slate-500">–</span>
          <input type="date" name="to" defaultValue={filters.to} className={inputClass} aria-label="Đến ngày" />
        </>
      )}
    </span>
  );
}
