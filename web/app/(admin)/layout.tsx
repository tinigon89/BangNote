import Link from 'next/link';
import { logout } from '@/app/login/actions';
import { requireSession } from '@/lib/auth/require';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <header className="flex items-center gap-4">
        <Link href="/" className="text-lg font-semibold">
          BangNote
        </Link>
        <nav className="flex gap-3 text-sm text-slate-600">
          <Link href="/" className="hover:text-slate-900">
            Ghi chú
          </Link>
          <Link href="/tags" className="hover:text-slate-900">
            Tag
          </Link>
          <Link href="/settings" className="hover:text-slate-900">
            Cài đặt
          </Link>
        </nav>
        <form action={logout} className="ml-auto">
          <button className="text-sm text-slate-500 hover:text-slate-900">Đăng xuất</button>
        </form>
      </header>
      {children}
    </div>
  );
}
