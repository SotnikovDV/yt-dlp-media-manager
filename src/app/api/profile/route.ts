import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

const UpdateSchema = z.object({
  name: z.string().max(100).optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  telegramChatId: z.union([z.string(), z.null()]).optional(),
});

function isValidTelegramChatId(s: string): boolean {
  return /^-?\d+$/.test(s.trim());
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      isAdmin: true,
      isAllowed: true,
      avatarPath: true,
      telegramChatId: true,
    },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const telegramUserBotWebhookSecretEnabled = env.telegramUserBotWebhookSecret().trim().length > 0;

  return NextResponse.json({
    ...user,
    avatarUrl: `/api/avatar/${user.id}`,
    telegramUserBotWebhookSecretEnabled,
  });
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const json = await request.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 });
  }

  const name = parsed.data.name?.trim() || null;
  const email = parsed.data.email?.trim() || null;

  if (email) {
    const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (existing && existing.id !== session.user.id) {
      return NextResponse.json({ error: 'Email уже используется' }, { status: 409 });
    }
  }

  let telegramChatId: string | null | undefined = undefined;
  if (parsed.data.telegramChatId !== undefined) {
    const raw = parsed.data.telegramChatId;
    if (raw === null || raw.trim() === '') {
      telegramChatId = null;
    } else {
      const t = raw.trim();
      if (!isValidTelegramChatId(t)) {
        return NextResponse.json(
          { error: 'Telegram Chat ID: укажите число (например ID из @userinfobot)' },
          { status: 400 }
        );
      }
      const existingTg = await db.user.findUnique({
        where: { telegramChatId: t },
        select: { id: true },
      });
      if (existingTg && existingTg.id !== session.user.id) {
        return NextResponse.json({ error: 'Этот Telegram уже привязан к другому аккаунту' }, { status: 409 });
      }
      telegramChatId = t;
    }
  }

  const user = await db.user.update({
    where: { id: session.user.id },
    data: {
      name,
      email,
      ...(telegramChatId !== undefined ? { telegramChatId } : {}),
    },
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      isAdmin: true,
      isAllowed: true,
      avatarPath: true,
      telegramChatId: true,
    },
  });

  return NextResponse.json({
    success: true,
    user,
    telegramUserBotWebhookSecretEnabled: env.telegramUserBotWebhookSecret().trim().length > 0,
  });
}

