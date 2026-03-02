'use client';

import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function PendingPage() {
  const { data: session } = useSession();
  const name = session?.user?.name || session?.user?.email || session?.user?.username || 'Пользователь';

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Доступ ожидает одобрения</CardTitle>
          <CardDescription>
            {name}, ваш аккаунт создан, но доступ к приложению ещё не разрешён администратором.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Вы можете заполнить профиль (имя, email, аватар) — это поможет администратору быстрее вас идентифицировать.
          </p>
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/profile">Профиль</Link>
          </Button>
          <Button variant="destructive" onClick={() => signOut({ callbackUrl: '/login' })}>
            Выйти
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

