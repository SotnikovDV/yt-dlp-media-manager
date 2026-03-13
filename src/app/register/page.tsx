'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Eye, EyeOff, User, Mail, Lock, Play } from 'lucide-react';
import { toast } from 'sonner';

async function jsonOrThrow(res: Response) {
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);

  const submit = async () => {
    const usernameTrim = username.trim();
    if (usernameTrim.length < 3) {
      toast.error('Логин: минимум 3 символа');
      return;
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(usernameTrim)) {
      toast.error('Логин: допустимы только латиница, цифры, точка, _, -');
      return;
    }
    if (password.length < 6) {
      toast.error('Пароль: минимум 6 символов');
      return;
    }
    if (password !== password2) {
      toast.error('Пароли не совпадают');
      return;
    }
    const emailTrim = email.trim();
    if (emailTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      toast.error('Некорректный email');
      return;
    }
    setLoading(true);
    try {
      await jsonOrThrow(
        await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: usernameTrim, name: name.trim() || undefined, email: emailTrim || undefined, password }),
        })
      );

      // Авто-логин после регистрации
      const result = await signIn('credentials', {
        redirect: false,
        identifier: usernameTrim,
        password,
      });

      if (result?.error) {
        toast.success('Регистрация выполнена. Войдите в систему.');
        router.push('/login');
        return;
      }

      router.push('/');
    } catch (e: unknown) {
      const err = e as Error;
      toast.error(err?.message || 'Ошибка регистрации');
    } finally {
      setLoading(false);
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
                  <span className="font-bold">DVSt</span> Media Manager
                </span>
              </div>
            </div>
            <CardTitle className="text-2xl font-semibold">Регистрация</CardTitle>
            <CardDescription className="mt-1 text-sm">
              После регистрации доступ будет выдан администратором
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pb-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="username" className="text-sm font-medium text-slate-700">
                  Логин
                </Label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <User className="h-4 w-4" />
                  </span>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="username"
                    className="pl-10 h-11 rounded-xl bg-slate-50/60 border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <p className="text-xs text-slate-400">Латиница, цифры, ., _, -</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium text-slate-700">
                  Имя (опционально)
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ваше имя"
                  className="h-11 rounded-xl bg-slate-50/60 border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-slate-700">
                  Email (опционально)
                </Label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <Mail className="h-4 w-4" />
                  </span>
                  <Input
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="mail@example.com"
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

              <div className="space-y-2">
                <Label htmlFor="password2" className="text-sm font-medium text-slate-700">
                  Пароль ещё раз
                </Label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <Lock className="h-4 w-4" />
                  </span>
                  <Input
                    id="password2"
                    type={showPassword2 ? 'text' : 'password'}
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                    className="pl-10 pr-10 h-11 rounded-xl bg-slate-50/60 border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute inset-y-0 right-0 flex h-full w-10 items-center justify-center text-slate-400 hover:bg-transparent"
                    onClick={() => setShowPassword2(!showPassword2)}
                    tabIndex={-1}
                    aria-label={showPassword2 ? 'Скрыть пароль' : 'Показать пароль'}
                  >
                    {showPassword2 ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md"
                disabled={loading}
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Зарегистрироваться
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex flex-col gap-3 pt-0 pb-6">
            <p className="text-sm text-slate-500 text-center">
              Уже есть аккаунт?{' '}
              <Link className="font-medium text-blue-600 hover:text-blue-700" href="/login">
                Войти
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>

      <span className="mt-6 text-xs text-slate-400 text-center">2026 © DVSt Home</span>
    </div>
  );
}

