import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/api/auth',
  '/watch',
  '/api/stream',
  '/api/thumbnail',
  '/playlist/shared',
  '/api/playlists/public',
];

const PENDING_ALLOWED_PATHS = [
  '/pending',
  '/profile',
  '/api/profile',
  '/api/avatar',
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p));
}

function isPendingAllowed(pathname: string) {
  return PENDING_ALLOWED_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function isAdminPath(pathname: string) {
  return pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/api/admin');
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Next internals / static
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon.ico')) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const secret =
    process.env.NEXTAUTH_SECRET ||
    (process.env.NODE_ENV !== 'production' ? 'dev-insecure-secret-change-me' : undefined);
  const token = await getToken({ req, secret });
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  const isAdmin = (token as any).isAdmin === true;
  const isAllowed = (token as any).isAllowed === true;

  if (isAdminPath(pathname) && !isAdmin) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  if (!isAllowed && !isAdmin) {
    if (isPendingAllowed(pathname)) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = '/pending';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

