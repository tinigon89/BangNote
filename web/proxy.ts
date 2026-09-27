import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';

export function proxy(req: NextRequest) {
  if (verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  return NextResponse.redirect(new URL('/login', req.url));
}

export const config = {
  matcher: ['/((?!api|login|_next/static|_next/image|favicon.ico).*)'],
};
