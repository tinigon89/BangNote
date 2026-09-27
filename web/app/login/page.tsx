import { login } from './actions';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <form action={login} className="w-full max-w-xs space-y-3 rounded-xl bg-white p-6 shadow">
        <h1 className="text-xl font-semibold">BangNote</h1>
        <input
          name="password"
          type="password"
          required
          autoFocus
          placeholder="Mật khẩu"
          className="w-full rounded-lg border px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">Sai mật khẩu</p>}
        <button className="w-full rounded-lg bg-slate-900 py-2 text-white hover:bg-slate-700">Đăng nhập</button>
      </form>
    </main>
  );
}
