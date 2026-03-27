import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { lastUserBotUpdate } from '@/lib/user-bot-debug';

export const runtime = 'nodejs';

/**
 * GET /api/telegram/user-bot-webhook-last-update
 * Админ: показывает последний апдейт, который дошёл на наш webhook.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({ success: true, lastUserBotUpdate });
}

