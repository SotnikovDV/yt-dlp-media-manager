'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export function DefaultAdminBanner() {
  const { data: session, status } = useSession();
  const user = session?.user as { username?: string | null; passwordChangedAt?: Date | string | null } | undefined;
  const username = user?.username;
  const passwordChangedAt = user?.passwordChangedAt;

  // Показываем баннер только для admin и только если пароль ещё не менялся
  if (status !== 'authenticated' || username !== 'admin' || passwordChangedAt != null) return null;

  return (
    <div role="alert" className="w-full border-b bg-card pt-16 lg:pt-0 px-4 pb-3 text-destructive text-sm">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-2 font-medium">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Учётная запись по умолчанию</span>
        </div>
        <p className="text-destructive/90">
          Вы вошли под учётной записью администратора по умолчанию. Рекомендуем сменить пароль.
        </p>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="border-destructive/50 text-destructive hover:bg-destructive/10"
        >
          <Link href="/profile">Сменить пароль</Link>
        </Button>
      </div>
    </div>
  );
}
