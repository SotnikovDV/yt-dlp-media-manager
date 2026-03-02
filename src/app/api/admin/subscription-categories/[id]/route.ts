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

const updateBodySchema = z.object({
  name: z.string().min(1, 'Название обязательно').optional(),
  backgroundColor: z.string().min(1, 'Цвет обязателен').optional(),
});

/**
 * PATCH /api/admin/subscription-categories/[id]
 * Обновить категорию. Только для isAdmin.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = updateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((e) => e.message).join('; ') },
      { status: 400 }
    );
  }

  const existing = await db.subscriptionCategory.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Категория не найдена' }, { status: 404 });

  const data: { name?: string; backgroundColor?: string } = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
  if (parsed.data.backgroundColor !== undefined) data.backgroundColor = parsed.data.backgroundColor;

  const category = await db.subscriptionCategory.update({
    where: { id },
    data,
  });
  return NextResponse.json(category);
}

/**
 * DELETE /api/admin/subscription-categories/[id]
 * Удалить категорию. Только для isAdmin. Подписки с этой категорией останутся, categoryId станет null.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const existing = await db.subscriptionCategory.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Категория не найдена' }, { status: 404 });

  await db.subscriptionCategory.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
