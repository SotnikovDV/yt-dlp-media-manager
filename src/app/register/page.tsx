'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Eye, EyeOff } from 'lucide-react';
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
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Регистрация</CardTitle>
          <CardDescription>После регистрации доступ будет выдан администратором</CardDescription>
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
            <Label htmlFor="username">Логин</Label>
            <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
            <p className="text-xs text-muted-foreground">Латиница, цифры, ., _, -</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Имя (опционально)</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ваше имя" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email (опционально)</Label>
            <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="mail@example.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Пароль</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
          <div className="space-y-2">
            <Label htmlFor="password2">Пароль ещё раз</Label>
            <div className="relative">
              <Input
                id="password2"
                type={showPassword2 ? 'text' : 'password'}
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowPassword2(!showPassword2)}
                tabIndex={-1}
                aria-label={showPassword2 ? 'Скрыть пароль' : 'Показать пароль'}
              >
                {showPassword2 ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Зарегистрироваться
          </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Уже есть аккаунт?{' '}
            <Link className="underline" href="/login">
              Войти
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

