'use client';

import { useActionState } from 'react';
import type { ActionState } from '@/app/(admin)/actions';

export function ActionButton({
  action,
  label,
  pendingLabel = 'Đang xử lý…',
  okMessage,
  className = 'rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50',
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  label: string;
  pendingLabel?: string;
  okMessage?: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <button disabled={pending} className={className}>
        {pending ? pendingLabel : label}
      </button>
      {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      {state.ok && okMessage && <span className="text-sm text-green-700">{okMessage}</span>}
    </form>
  );
}
