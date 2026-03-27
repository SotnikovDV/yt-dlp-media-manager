'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getProviders, signIn } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Eye, EyeOff, User, Lock, Play } from 'lucide-react';
import { HelpDocLink } from '@/components/help-doc-link';
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
      router.replace(from);
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100/80 px-4 py-6">
      <div className="w-full max-w-md">
        <Card className="w-full border-0 shadow-xl rounded-3xl bg-white/90 p-2 md:p-4">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-md">
                <Play className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold tracking-tight">
                  <span className="font-bold">DVStream</span>
                </span>
              </div>
            </div>
            <CardTitle className="text-2xl font-semibold">Добро пожаловать</CardTitle>
            <CardDescription className="mt-1 text-sm">
              Войдите в аккаунт для доступа к медиатеке
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pb-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="space-y-5"
            >
              <div className="space-y-2">
                <Label htmlFor="identifier" className="text-sm font-medium text-slate-700">
                  Логин или Email
                </Label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <User className="h-4 w-4" />
                  </span>
                  <Input
                    id="identifier"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="admin"
                    autoComplete="username"
                    className="pl-10 h-11 rounded-xl bg-slate-50/60 border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-slate-700">
                  Пароль
                </Label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <Lock className="h-4 w-4" />
                  </span>
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="pl-10 pr-10 h-11 rounded-xl bg-slate-50/60 border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute inset-y-0 right-0 flex h-full w-10 items-center justify-center text-slate-400 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs sm:text-sm text-slate-600">
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    name="remember"
                  />
                  <span>Запомнить меня</span>
                </label>
                <button
                  type="button"
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  Забыли пароль?
                </button>
              </div>

              <Button
                type="submit"
                className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md"
                disabled={loading}
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Войти в систему
              </Button>

              <div className="flex items-center gap-3 text-xs text-slate-400">
                <div className="h-px flex-1 bg-slate-200" />
                <span>или</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              {/* Кнопка Google временно скрыта, логика оставлена */}
              {false && hasGoogle && (
                <Button
                  type="button"
                  className="w-full h-11 rounded-xl"
                  variant="outline"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                >
                  Войти через Google
                </Button>
              )}
            </form>
          </CardContent>
          <CardFooter className="flex flex-col gap-3 pt-0 pb-6">
            <p className="text-sm text-slate-500 text-center">
              Нет аккаунта?{' '}
              <Link className="font-medium text-blue-600 hover:text-blue-700" href="/register">
                Запросить доступ
              </Link>
            </p>
            <p className="text-xs text-slate-400 text-center">
              <HelpDocLink section="auth" className="text-slate-500 hover:text-blue-600 font-normal">
                Справка: вход и регистрация
              </HelpDocLink>
            </p>
          </CardFooter>
        </Card>
      </div>

      <span className="mt-6 text-xs text-slate-400 text-center">2026 © DVSt Home</span>
    </div>
  );
}

