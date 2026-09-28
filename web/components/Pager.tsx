import Link from 'next/link';
import { pageItems } from '@/lib/pager';

export function Pager({ page, pageCount, hrefFor }: { page: number; pageCount: number; hrefFor: (page: number) => string }) {
  if (pageCount <= 1) return null;
  const cell = 'min-w-9 rounded-lg border px-3 py-1 text-center text-sm';
  return (
    <nav className="flex flex-wrap items-center justify-center gap-1" aria-label="Phân trang">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={`${cell} bg-white`} aria-label="Trang trước">
          ‹
        </Link>
      ) : (
        <span className={`${cell} text-slate-300`}>‹</span>
      )}
      {pageItems(page, pageCount).map((item, i) =>
        item === '…' ? (
          <span key={`gap-${i}`} className="px-1 text-slate-400">
            …
          </span>
        ) : item === page ? (
          <span key={item} aria-current="page" className={`${cell} border-slate-900 bg-slate-900 text-white`}>
            {item}
          </span>
        ) : (
          <Link key={item} href={hrefFor(item)} className={`${cell} bg-white hover:bg-slate-50`}>
            {item}
          </Link>
        ),
      )}
      {page < pageCount ? (
        <Link href={hrefFor(page + 1)} className={`${cell} bg-white`} aria-label="Trang sau">
          ›
        </Link>
      ) : (
        <span className={`${cell} text-slate-300`}>›</span>
      )}
    </nav>
  );
}
