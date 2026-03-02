import NextAuth from 'next-auth';
import { authOptions, ensureDefaultAdmin } from '@/lib/auth';

// Создаём учётную запись администратора по умолчанию при первом старте (best-effort)
void ensureDefaultAdmin().catch((e) => {
  console.error('[auth] ensureDefaultAdmin failed:', e);
});

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

