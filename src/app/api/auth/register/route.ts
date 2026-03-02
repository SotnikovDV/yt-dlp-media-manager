import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

const RegisterSchema = z.object({
  username: z
    .string()
    .min(3, 'Минимум 3 символа')
    .max(50, 'Слишком длинное имя пользователя')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Допустимы только латиница, цифры, точка, _, -'),
  password: z.string().min(6, 'Минимум 6 символов').max(200),
  email: z.string().email('Некорректный email').optional().or(z.literal('')),
  name: z.string().max(100).optional().or(z.literal('')),
});

// POST /api/auth/register — регистрация пользователя (isAllowed/isAdmin по умолчанию false)
export async function POST(request: NextRequest) {
  try {
    const json = await request.json().catch(() => null);
    const parsed = RegisterSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 });
    }

    const username = parsed.data.username.trim();
    const email = parsed.data.email?.trim() || null;
    const name = parsed.data.name?.trim() || null;
    const password = parsed.data.password;

    const [u1, u2] = await Promise.all([
      db.user.findUnique({ where: { username }, select: { id: true } }),
      email ? db.user.findUnique({ where: { email }, select: { id: true } }) : Promise.resolve(null),
    ]);

    if (u1) return NextResponse.json({ error: 'Пользователь с таким логином уже существует' }, { status: 409 });
    if (u2) return NextResponse.json({ error: 'Пользователь с таким email уже существует' }, { status: 409 });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await db.user.create({
      data: {
        username,
        email,
        name,
        passwordHash,
        isAdmin: false,
        isAllowed: false,
      },
      select: { id: true, username: true, email: true, name: true, isAllowed: true, isAdmin: true },
    });

    return NextResponse.json({ success: true, user });
  } catch (error: any) {
    console.error('Register error:', error);
    const msg = process.env.NODE_ENV === 'development' ? error?.message : 'Failed to register';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

