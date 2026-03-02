import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

const UpdateSchema = z.object({
  name: z.string().max(100).optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, username: true, email: true, name: true, isAdmin: true, isAllowed: true, avatarPath: true },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  return NextResponse.json({
    ...user,
    avatarUrl: `/api/avatar/${user.id}`,
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

  const user = await db.user.update({
    where: { id: session.user.id },
    data: { name, email },
    select: { id: true, username: true, email: true, name: true, isAdmin: true, isAllowed: true, avatarPath: true },
  });

  return NextResponse.json({ success: true, user });
}

