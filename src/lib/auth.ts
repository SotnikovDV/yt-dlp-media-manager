import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';

const AUTH_SECRET =
  process.env.NEXTAUTH_SECRET ||
  (process.env.NODE_ENV !== 'production' ? 'dev-insecure-secret-change-me' : undefined);

/**
 * Создаёт или обновляет учётную запись администратора по умолчанию (username: admin).
 * Пароль: INITIAL_ADMIN_PASSWORD в production (обязательно), в development по умолчанию 'admin'.
 * В production без INITIAL_ADMIN_PASSWORD учётная запись не создаётся — создайте админа через /register и назначьте права вручную или задайте INITIAL_ADMIN_PASSWORD.
 */
export async function ensureDefaultAdmin() {
  const username = 'admin';
  const envPassword = process.env.INITIAL_ADMIN_PASSWORD?.trim();
  const password =
    envPassword || (process.env.NODE_ENV !== 'production' ? 'admin' : undefined);

  const existing = await db.user.findUnique({ where: { username } });
  if (!existing) {
    if (!password) return; // в production без INITIAL_ADMIN_PASSWORD не создаём дефолтного админа
    const passwordHash = await bcrypt.hash(password, 10);
    await db.user.create({
      data: {
        username,
        name: 'Administrator',
        passwordHash,
        isAdmin: true,
        isAllowed: true,
      },
    });
    return;
  }

  const updates: Record<string, any> = {};
  if (!existing.isAdmin) updates.isAdmin = true;
  if (!existing.isAllowed) updates.isAllowed = true;
  if (!existing.passwordHash && password) updates.passwordHash = await bcrypt.hash(password, 10);
  if (!existing.name) updates.name = 'Administrator';
  if (Object.keys(updates).length > 0) {
    await db.user.update({ where: { id: existing.id }, data: updates });
  }
}

export const authOptions: NextAuthOptions = {
  secret: AUTH_SECRET,
  adapter: PrismaAdapter(db),
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        identifier: { label: 'Username or Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const identifier = credentials?.identifier?.toString().trim();
        const password = credentials?.password?.toString();
        if (!identifier || !password) return null;

        const user = await db.user.findFirst({
          where: {
            OR: [{ username: identifier }, { email: identifier }],
          },
        });
        if (!user?.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          username: user.username,
          isAdmin: user.isAdmin,
          isAllowed: user.isAllowed,
          avatarPath: user.avatarPath,
        } as any;
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // При логине (user присутствует) — проставим поля.
      if (user) {
        token.sub = (user as any).id ?? token.sub;
      }

      // Чтобы изменения isAllowed/isAdmin в БД применялись без ре-логина — обновляем из БД.
      if (token.sub) {
        const dbUser = await db.user.findUnique({
          where: { id: token.sub },
          select: { isAdmin: true, isAllowed: true, name: true, email: true, image: true, avatarPath: true, username: true, passwordChangedAt: true },
        });
        if (dbUser) {
          (token as any).isAdmin = dbUser.isAdmin;
          (token as any).isAllowed = dbUser.isAllowed;
          (token as any).name = dbUser.name;
          (token as any).email = dbUser.email;
          (token as any).image = dbUser.image;
          (token as any).avatarPath = dbUser.avatarPath;
          (token as any).username = dbUser.username;
          (token as any).passwordChangedAt = dbUser.passwordChangedAt;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub;
        (session.user as any).isAdmin = (token as any).isAdmin ?? false;
        (session.user as any).isAllowed = (token as any).isAllowed ?? false;
        (session.user as any).avatarPath = (token as any).avatarPath ?? null;
        (session.user as any).username = (token as any).username ?? null;
        (session.user as any).passwordChangedAt = (token as any).passwordChangedAt ?? null;
      }
      return session;
    },
  },
};

