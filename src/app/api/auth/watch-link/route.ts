import { NextRequest, NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { verifyWatchLoginToken } from '@/lib/watch-login-token';

export const runtime = 'nodejs';

function loginRedirect(error: string): NextResponse {
  const base = env.baseUrl().replace(/\/$/, '');
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, base));
}

function sessionCookieName(useSecure: boolean): string {
  return useSecure ? '__Secure-next-auth.session-token' : 'next-auth.session-token';
}

/**
 * GET /api/auth/watch-link?t=…
 * Подписанная ссылка из Telegram: выставляет сессию NextAuth и редирект на /watch/:id.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t');
  if (!token?.trim()) {
    return loginRedirect('watchlink');
  }

  const parsed = verifyWatchLoginToken(token.trim());
  if (!parsed) {
    return loginRedirect('watchlink_invalid');
  }

  const { userId, videoId } = parsed;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, isAllowed: true },
  });
  if (!user?.isAllowed) {
    return loginRedirect('watchlink_user');
  }

  const video = await db.video.findUnique({
    where: { id: videoId },
    select: { id: true, channelId: true },
  });
  if (!video) {
    return loginRedirect('watchlink_video');
  }

  const [sub, individual, adminUser] = await Promise.all([
    db.subscription.findFirst({
      where: { userId, channelId: video.channelId, isActive: true },
      select: { id: true },
    }),
    db.userIndividualVideo.findFirst({
      where: { userId, videoId: video.id },
      select: { id: true },
    }),
    db.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    }),
  ]);

  const hasAccess = Boolean(adminUser?.isAdmin || sub || individual);
  if (!hasAccess) {
    return loginRedirect('watchlink_forbidden');
  }

  const secret = process.env.NEXTAUTH_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const sessionJwt = await encode({
    secret,
    token: { sub: user.id },
    maxAge: 30 * 24 * 60 * 60,
  });

  const baseUrl = env.baseUrl().replace(/\/$/, '');
  const useSecure = baseUrl.startsWith('https://');
  const name = sessionCookieName(useSecure);

  const target = new URL(`/watch/${encodeURIComponent(videoId)}`, baseUrl);
  /** По умолчанию открыть плеер в полноэкранном режиме (мобильный клиент из Telegram). */
  target.searchParams.set('fs', '1');
  const res = NextResponse.redirect(target, 302);
  res.cookies.set(name, sessionJwt, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: useSecure,
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}
