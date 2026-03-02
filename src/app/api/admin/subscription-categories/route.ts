import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

export const runtime = 'nodejs';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if ((session.user as { isAdmin?: boolean }).isAdmin !== true) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { session };
}

const createBodySchema = z.object({
  name: z.string().min(1, 'Название обязательно'),
  backgroundColor: z.string().min(1, 'Цвет обязателен').default('#e5e7eb'),
});

/**
 * GET /api/admin/subscription-categories
 * Список категорий подписок. Только для isAdmin.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const categories = await db.subscriptionCategory.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { subscriptions: true } } },
  });
  return NextResponse.json(categories);
}

/**
 * POST /api/admin/subscription-categories
 * Создать категорию. Только для isAdmin.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const parsed = createBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((e) => e.message).join('; ') },
      { status: 400 }
    );
  }

  const category = await db.subscriptionCategory.create({
    data: {
      name: parsed.data.name.trim(),
      backgroundColor: parsed.data.backgroundColor,
    },
  });
  return NextResponse.json(category);
}
