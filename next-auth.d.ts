import NextAuth, { DefaultSession } from 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user?: DefaultSession['user'] & {
      id?: string;
      username?: string | null;
      isAdmin?: boolean;
      isAllowed?: boolean;
      avatarPath?: string | null;
    };
  }

  interface User {
    username?: string | null;
    isAdmin?: boolean;
    isAllowed?: boolean;
    avatarPath?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    isAdmin?: boolean;
    isAllowed?: boolean;
    avatarPath?: string | null;
  }
}

