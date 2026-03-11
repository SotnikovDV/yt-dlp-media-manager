'use client';

import { useEffect, useMemo, useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

async function jsonOrThrow(res: Response) {
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

type ProfileDto = {
  id: string;
  username: string | null;
  email: string | null;
  name: string | null;
  isAdmin: boolean;
  isAllowed: boolean;
  avatarUrl: string;
};

export default function ProfilePage() {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [profile, setProfile] = useState<ProfileDto | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');

  const avatarSrc = useMemo(() => {
    if (!profile?.avatarUrl) return '';
    return `${profile.avatarUrl}?t=${Date.now()}`;
  }, [profile?.avatarUrl]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await jsonOrThrow(await fetch('/api/profile'));
        if (cancelled) return;
        setProfile(data);
        setName(data.name || '');
        setEmail(data.email || '');
      } catch (e: any) {
        toast.error(e?.message || 'Не удалось загрузить профиль');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const data = await jsonOrThrow(
        await fetch('/api/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email }),
        })
      );
      setProfile((p) => (p ? { ...p, ...data.user } : p));
      toast.success('Профиль сохранён');
    } catch (e: any) {
      toast.error(e?.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (newPassword !== newPassword2) {
      toast.error('Пароли не совпадают');
      return;
    }
    setChangingPassword(true);
    try {
      await jsonOrThrow(
        await fetch('/api/profile/password', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword, newPassword }),
        })
      );
      setCurrentPassword('');
      setNewPassword('');
      setNewPassword2('');
      toast.success('Пароль изменён');
    } catch (e: any) {
      toast.error(e?.message || 'Ошибка смены пароля');
    } finally {
      setChangingPassword(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const data = await jsonOrThrow(await fetch('/api/profile/avatar', { method: 'POST', body: form }));
      setProfile((p) => (p ? { ...p, avatarUrl: data.avatarUrl } : p));
      toast.success('Аватар обновлён');
    } catch (e: any) {
      toast.error(e?.message || 'Ошибка загрузки аватара');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 lg:py-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Профиль</h1>
          <p className="text-sm text-muted-foreground">
            {profile?.isAllowed ? 'Доступ разрешён' : 'Ожидает одобрения'}{profile?.isAdmin ? ' · Администратор' : ''}
          </p>
        </div>
        <Button variant="destructive" onClick={() => signOut({ callbackUrl: '/login' })}>
          Выйти
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Основные данные</CardTitle>
          <CardDescription>Логин: {profile?.username || '—'} · ID: {userId || '—'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-muted overflow-hidden flex items-center justify-center">
              {profile?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarSrc} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs text-muted-foreground">Нет</span>
              )}
            </div>
            <div className="flex-1">
              <Label htmlFor="avatar">Аватар</Label>
              <Input
                id="avatar"
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadAvatar(f);
                }}
              />
              <p className="text-xs text-muted-foreground mt-1">PNG/JPG/WebP, до 5MB</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Имя</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Сохранить
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Смена пароля</CardTitle>
          <CardDescription>Для аккаунтов с логином/паролем</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Текущий пароль</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Новый пароль</Label>
              <Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword2">Новый пароль ещё раз</Label>
              <Input
                id="newPassword2"
                type="password"
                value={newPassword2}
                onChange={(e) => setNewPassword2(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button onClick={changePassword} disabled={changingPassword}>
            {changingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Изменить пароль
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
