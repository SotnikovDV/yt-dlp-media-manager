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
  /** Telegram webhook для пользовательского бота (/id, /start); защита секретом в route */
  '/api/telegram/user-bot-webhook',
];

const PENDING_ALLOWED_PATHS = [
  '/pending',
  '/profile',
  '/api/profile',
  '/api/avatar',
  '/api/telegram/user-bot-webhook-info',
  '/api/telegram/user-bot-webhook-last-update',
  '/api/telegram/user-bot-set-webhook',
];

function isPublicPath(pathname: string) {
  if (pathname.startsWith('/api/telegram/user-bot-hook/')) return true;
  /** Статическая справка — доступна без входа (ссылки со страниц логина/регистрации). */
  if (pathname === '/help' || pathname.startsWith('/help/')) return true;
  return PUBLIC_PATHS.some((p) => {
    // Только точный путь webhook (после normalize — и с `/` в конце у клиента)
    if (p === '/api/telegram/user-bot-webhook') return pathname === p;
    return pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(p);
  });
}

function isPendingAllowed(pathname: string) {
  return PENDING_ALLOWED_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function isAdminPath(pathname: string) {
  return pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/api/admin');
}

/** Убираем завершающий `/` для сопоставления с PUBLIC_PATHS (кроме корня `/`). */
function normalizePathname(pathname: string): string {
  if (pathname !== '/' && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

export async function middleware(req: NextRequest) {
  const pathname = normalizePathname(req.nextUrl.pathname);

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

/**
 * Webhook Telegram не проходим через middleware: у Next.js были кейсы, когда наличие middleware
 * задерживало/ломало обработку POST с телом; Telegram тогда получает «Read timeout expired».
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/telegram/user-bot-hook/|api/telegram/user-bot-webhook$).*)',
  ],
};

