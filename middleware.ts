import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/planner', '/trip', '/app'];
const PUBLIC_PREFIXES = ['/api/health', '/api/v1/catalog', '/auth', '/privacy', '/favicon.ico'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const isPublic = PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (!isProtected || isPublic) return NextResponse.next();

  const session = req.cookies.get('sb-' + process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0] ?? 'parapo')?.value;
  if (!session) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/auth';
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/planner/:path*', '/trip/:path*', '/(app)/:path*', '/auth'],
};
