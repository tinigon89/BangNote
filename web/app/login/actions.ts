'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, SESSION_MAX_AGE, checkPassword, createSessionToken } from '@/lib/auth/session';

export async function login(formData: FormData): Promise<void> {
  const password = String(formData.get('password') ?? '');
  if (!checkPassword(password)) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    redirect('/login?error=1');
  }
  (await cookies()).set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
  redirect('/');
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}
