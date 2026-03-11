import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if ((session.user as { isAdmin?: boolean }).isAdmin !== true) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { session };
}

/**
 * DELETE /api/admin/tags/[id]
 * Удалить тег. Только для isAdmin.
 * Все связи VideoTag будут удалены каскадно.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;

  const existing = await db.tag.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Тег не найден' }, { status: 404 });
  }

  await db.tag.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

/**
 * PATCH /api/admin/tags/[id]
 * Переименовать тег. Только для isAdmin.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => ({} as { name?: string }));
  const rawName = typeof body?.name === 'string' ? body.name.trim().toLowerCase() : '';

  if (!rawName) {
    return NextResponse.json({ error: 'Новое имя тега не задано' }, { status: 400 });
  }

  const existing = await db.tag.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Тег не найден' }, { status: 404 });
  }

  if (existing.name === rawName) {
    return NextResponse.json(existing);
  }

  // Если уже есть тег с таким именем — переназначаем связи и удаляем текущий тег.
  const target = await db.tag.findUnique({ where: { name: rawName } });
  if (target) {
    // Переносим все VideoTag на существующий тег
    await db.$transaction([
      db.videoTag.deleteMany({
        where: { tagId: target.id },
      }),
      db.videoTag.updateMany({
        where: { tagId: id },
        data: { tagId: target.id },
      }),
      db.tag.delete({ where: { id } }),
    ]);
    return NextResponse.json(target);
  }

  const updated = await db.tag.update({
    where: { id },
    data: { name: rawName },
  });

  return NextResponse.json(updated);
}

