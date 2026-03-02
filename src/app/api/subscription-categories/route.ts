import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * GET /api/subscription-categories
 * Список категорий подписок для выбора при редактировании подписки. Доступно авторизованным пользователям.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const categories = await db.subscriptionCategory.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, backgroundColor: true },
  });
  return NextResponse.json(categories);
}
