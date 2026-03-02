import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

const UpdateUserSchema = z.object({
  isAllowed: z.boolean().optional(),
  isAdmin: z.boolean().optional(),
});

/**
 * PATCH /api/admin/users/[id]
 * Обновить isAllowed и/или isAdmin. Только для isAdmin.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((session.user as any).isAdmin !== true) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const json = await request.json().catch(() => null);
  const parsed = UpdateUserSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 });
  }

  const targetUser = await db.user.findUnique({ where: { id }, select: { id: true, isAdmin: true } });
  if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Не позволять снять isAdmin у самого себя
  if (targetUser.id === session.user.id && parsed.data.isAdmin === false) {
    const adminCount = await db.user.count({ where: { isAdmin: true } });
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: 'Нельзя снять права администратора у единственного админа' },
        { status: 400 }
      );
    }
  }

  const data: { isAllowed?: boolean; isAdmin?: boolean } = {};
  if (parsed.data.isAllowed !== undefined) data.isAllowed = parsed.data.isAllowed;
  if (parsed.data.isAdmin !== undefined) data.isAdmin = parsed.data.isAdmin;

  const user = await db.user.update({
    where: { id },
    data,
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      isAllowed: true,
      isAdmin: true,
      createdAt: true,
    },
  });

  return NextResponse.json(user);
}
