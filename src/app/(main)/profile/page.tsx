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
  telegramChatId: string | null;
  /** На сервере задан TELEGRAM_USER_BOT_WEBHOOK_SECRET — тест всегда переотправляет secret в Telegram */
  telegramUserBotWebhookSecretEnabled?: boolean;
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
  const [telegramChatId, setTelegramChatId] = useState('');

  const [telegramTestLoading, setTelegramTestLoading] = useState(false);

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
        setTelegramChatId(data.telegramChatId ?? '');
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
          body: JSON.stringify({
            name,
            email,
            telegramChatId: telegramChatId.trim() === '' ? null : telegramChatId.trim(),
          }),
        })
      );
      setProfile((p) =>
        p && data.user
          ? {
              ...p,
              ...data.user,
              avatarUrl: p.avatarUrl,
              telegramUserBotWebhookSecretEnabled:
                data.telegramUserBotWebhookSecretEnabled ?? p.telegramUserBotWebhookSecretEnabled,
            }
          : p
      );
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

  const sendTelegramTest = async () => {
    setTelegramTestLoading(true);
    try {
      const data = await jsonOrThrow(
        await fetch('/api/profile/telegram-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            telegramChatId: telegramChatId.trim() === '' ? undefined : telegramChatId.trim(),
          }),
        })
      );
      if (data?.webhookError) {
        toast.warning(`Сообщение отправлено, но webhook не настроился: ${data.webhookError}`);
      } else if (data?.webhookReRegistered && data?.webhookSecretConfigured) {
        toast.success(
          'Тестовое сообщение отправлено. Webhook и секрет синхронизированы с Telegram — команды /id и /start должны работать.'
        );
      } else if (data?.webhookReRegistered) {
        toast.success(
          'Тестовое сообщение отправлено. Webhook обновлён в Telegram — команды /id и /start должны работать.'
        );
      } else if (data?.webhookEnsured) {
        toast.success(
          'Тестовое сообщение отправлено. Webhook уже был настроен — проверьте /id и /start в боте.'
        );
      } else {
        toast.success('Тестовое сообщение отправлено — проверьте Telegram');
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Не удалось отправить');
    } finally {
      setTelegramTestLoading(false);
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

      <Card className="p-2 md:p-4">
        <CardHeader>
          <CardTitle className="text-base">Основные данные</CardTitle>
          <CardDescription>Логин: {profile?.username || '—'} · ID: {userId || '—'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-muted overflow-hidden flex items-center justify-center">
              {profile?.avatarUrl ? (
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

          <div className="space-y-2">
            <Label htmlFor="telegramChatId">Telegram Chat ID</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                id="telegramChatId"
                className="sm:flex-1"
                inputMode="numeric"
                placeholder="например 123456789"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0 sm:w-auto"
                disabled={telegramTestLoading}
                onClick={() => void sendTelegramTest()}
              >
                {telegramTestLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Тестовое уведомление
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Нужен <strong className="font-medium">ваш</strong> личный числовой ID (чат с человеком), а не ID бота.
              Удобнее всего: если настроен webhook для бота с{' '}
              <code className="text-[0.8rem]">TELEGRAM_USER_BOT_TOKEN</code>, напишите ему{' '}
              <span className="whitespace-nowrap">/id</span> или <span className="whitespace-nowrap">/start</span> — бот
              пришлёт число для вставки сюда. Иначе можно узнать ID через @userinfobot (не путайте с ID бота из
              ответа). Тест «Тестовое уведомление» использует значение в поле; если поле пустое — сохранённый ID.
              {profile?.telegramUserBotWebhookSecretEnabled ? (
                <>
                  {' '}
                  На сервере включён секрет webhook: каждый тест заново передаёт его в Telegram (ручной POST не нужен).
                </>
              ) : null}
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Сохранить
          </Button>
        </CardFooter>
      </Card>

      <Card className="p-2 md:p-4">
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
