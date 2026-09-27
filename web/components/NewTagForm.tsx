'use client';

import { useActionState, useEffect, useRef } from 'react';
import { createTagAction } from '@/app/(admin)/tags/actions';

export function NewTagForm() {
  const [state, formAction, pending] = useActionState(createTagAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-4 shadow-sm">
      <input name="name" required maxLength={50} placeholder="Tên tag mới (vd: Lịch sử)" className="flex-1 rounded-lg border px-3 py-1.5" />
      <button disabled={pending} className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50">
        {pending ? 'Đang tạo…' : 'Tạo tag'}
      </button>
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
