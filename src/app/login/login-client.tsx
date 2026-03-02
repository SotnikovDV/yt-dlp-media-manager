'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getProviders, signIn } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

export default function LoginClient() {
  const router = useRouter();
  const search = useSearchParams();
  const from = search.get('from') || '/';

  const [loading, setLoading] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [hasGoogle, setHasGoogle] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await getProviders();
        if (cancelled) return;
        setHasGoogle(Boolean(p?.google));
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async () => {
    const idTrim = identifier.trim();
    if (!idTrim) {
      toast.error('Введите логин или email');
      return;
    }
    if (!password) {
      toast.error('Введите пароль');
      return;
    }
    setLoading(true);
    try {
      const res = await signIn('credentials', {
        redirect: false,
        identifier: idTrim,
        password,
      });
      if (res?.error) {
        toast.error('Неверный логин или пароль');
        return;
      }
      router.push(from);
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Ошибка входа. Проверьте подключение и попробуйте снова.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    try {
      signIn('google', { callbackUrl: from });
    } catch {
      toast.error('Не удалось войти через Google');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Вход</CardTitle>
          <CardDescription>Авторизуйтесь для доступа к приложению</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="space-y-4"
          >
          <div className="space-y-2">
            <Label htmlFor="identifier">Логин или Email</Label>
            <Input
              id="identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="admin"
              autoComplete="username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Пароль</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Войти
          </Button>

          {hasGoogle && (
            <Button
              type="button"
              className="w-full"
              variant="outline"
              onClick={handleGoogleSignIn}
              disabled={loading}
            >
              Войти через Google
            </Button>
          )}
          </form>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Нет аккаунта?{' '}
            <Link className="underline" href="/register">
              Регистрация
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

