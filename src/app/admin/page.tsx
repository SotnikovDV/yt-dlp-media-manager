'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, FolderSync, ImageIcon, Loader2, Pencil, Plus, Shield, Tag, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';

type UserRow = {
  id: string;
  username: string | null;
  email: string | null;
  name: string | null;
  isAllowed: boolean;
  isAdmin: boolean;
  createdAt: string;
};

async function fetchUsers(): Promise<UserRow[]> {
  const res = await fetch('/api/admin/users');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function updateUser(id: string, data: { isAllowed?: boolean; isAdmin?: boolean }) {
  const res = await fetch(`/api/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

async function repairPaths(): Promise<{ updated: number; total: number }> {
  const res = await fetch('/api/admin/repair-paths', { method: 'POST' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

type BackfillResult = {
  channelsUpdated: number;
  channelsFailed: number;
  channelsTotal: number;
  videosUpdated: number;
  videosFailed: number;
  videosTotal: number;
};

async function backfillAvatarsThumbnails(): Promise<BackfillResult> {
  const res = await fetch('/api/admin/backfill-avatars-thumbnails', { method: 'POST' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

type CategoryRow = {
  id: string;
  name: string;
  backgroundColor: string;
  _count?: { subscriptions: number };
};

async function fetchCategories(): Promise<CategoryRow[]> {
  const res = await fetch('/api/admin/subscription-categories');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function createCategory(data: { name: string; backgroundColor: string }) {
  const res = await fetch('/api/admin/subscription-categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

async function updateCategory(id: string, data: { name?: string; backgroundColor?: string }) {
  const res = await fetch(`/api/admin/subscription-categories/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

async function deleteCategory(id: string) {
  const res = await fetch(`/api/admin/subscription-categories/${id}`, { method: 'DELETE' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const [filterPending, setFilterPending] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryColor, setCategoryColor] = useState('#e5e7eb');
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);

  const isAdmin = (session?.user as any)?.isAdmin === true;

  const { data: users, isLoading, error } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: fetchUsers,
    enabled: isAdmin,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { isAllowed?: boolean; isAdmin?: boolean } }) =>
      updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('Изменения сохранены');
    },
    onError: (e: Error) => {
      toast.error(e.message);
    },
  });

  const repairPathsMutation = useMutation({
    mutationFn: repairPaths,
    onSuccess: (data) => {
      toast.success(`Обновлено путей: ${data.updated} из ${data.total}`);
    },
    onError: (e: Error) => {
      toast.error(e.message);
    },
  });

  const backfillMutation = useMutation({
    mutationFn: backfillAvatarsThumbnails,
    onSuccess: (data) => {
      const parts: string[] = [];
      if (data.channelsTotal > 0) {
        parts.push(`Каналы: ${data.channelsUpdated} сохранено, ${data.channelsFailed} ошибок (из ${data.channelsTotal})`);
      }
      if (data.videosTotal > 0) {
        parts.push(`Превью: ${data.videosUpdated} сохранено, ${data.videosFailed} ошибок (из ${data.videosTotal})`);
      }
      toast.success(parts.length ? parts.join('. ') : 'Нет каналов/видео для обновления');
    },
    onError: (e: Error) => {
      toast.error(e.message);
    },
  });

  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['admin', 'subscription-categories'],
    queryFn: fetchCategories,
    enabled: isAdmin,
  });

  const createCategoryMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscription-categories'] });
      setCategoryDialogOpen(false);
      setCategoryName('');
      setCategoryColor('#e5e7eb');
      setEditingCategoryId(null);
      toast.success('Категория создана');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; backgroundColor?: string } }) =>
      updateCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscription-categories'] });
      setCategoryDialogOpen(false);
      setEditingCategoryId(null);
      setCategoryName('');
      setCategoryColor('#e5e7eb');
      toast.success('Категория обновлена');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscription-categories'] });
      setDeleteCategoryId(null);
      toast.success('Категория удалена');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCategoryDialog = (category?: CategoryRow) => {
    if (category) {
      setEditingCategoryId(category.id);
      setCategoryName(category.name);
      setCategoryColor(category.backgroundColor);
    } else {
      setEditingCategoryId(null);
      setCategoryName('');
      setCategoryColor('#e5e7eb');
    }
    setCategoryDialogOpen(true);
  };

  const saveCategory = () => {
    const name = categoryName.trim();
    if (!name) {
      toast.error('Введите название');
      return;
    }
    if (editingCategoryId) {
      updateCategoryMutation.mutate({
        id: editingCategoryId,
        data: { name, backgroundColor: categoryColor },
      });
    } else {
      createCategoryMutation.mutate({ name, backgroundColor: categoryColor });
    }
  };

  useEffect(() => {
    if (status === 'unauthenticated' || (status === 'authenticated' && !isAdmin)) {
      window.location.href = '/';
    }
  }, [status, isAdmin]);

  if (status === 'loading' || (status === 'authenticated' && !isAdmin)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filteredUsers = filterPending && users ? users.filter((u) => !u.isAllowed) : users ?? [];

  return (
    <div className="min-h-screen bg-background p-4 lg:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Shield className="h-6 w-6" />
                Управление пользователями
              </h1>
              <p className="text-sm text-muted-foreground">
                Выдача и отзыв доступа к сайту, назначение администраторов
              </p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Пользователи
            </CardTitle>
            <CardDescription>
              Переключатели сохраняются автоматически при изменении
            </CardDescription>
            <div className="pt-2">
              <Button
                variant={filterPending ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setFilterPending(!filterPending)}
              >
                {filterPending ? 'Только ожидающие' : 'Все'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <p className="text-destructive py-4">{(error as Error).message}</p>
            ) : filteredUsers.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center">
                {filterPending ? 'Нет пользователей, ожидающих одобрения' : 'Нет пользователей'}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Пользователь</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Доступ</TableHead>
                    <TableHead>Админ</TableHead>
                    <TableHead>Регистрация</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="font-medium">
                          {user.name || user.username || '—'}
                        </div>
                        {user.username && user.name && (
                          <div className="text-xs text-muted-foreground">{user.username}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.email || '—'}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={user.isAllowed}
                          disabled={updateMutation.isPending}
                          onCheckedChange={(checked) =>
                            updateMutation.mutate({
                              id: user.id,
                              data: { isAllowed: checked },
                            })
                          }
                        />
                        {!user.isAllowed && (
                          <Badge variant="secondary" className="ml-2">
                            Ожидает
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={user.isAdmin}
                          disabled={
                            updateMutation.isPending ||
                            (user.id === (session?.user as any)?.id && (users?.filter((u) => u.isAdmin) ?? []).length <= 1)
                          }
                          onCheckedChange={(checked) =>
                            updateMutation.mutate({
                              id: user.id,
                              data: { isAdmin: checked },
                            })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(user.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Категории подписок
            </CardTitle>
            <CardDescription>
              Справочник категорий для подписок. У каждой категории — название и цвет фона для карточки подписки.
            </CardDescription>
            <div className="pt-2">
              <Button size="sm" onClick={() => openCategoryDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Добавить категорию
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {categoriesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !categories?.length ? (
              <p className="text-muted-foreground py-4 text-center">Нет категорий. Добавьте первую.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Название</TableHead>
                    <TableHead>Цвет фона</TableHead>
                    <TableHead>Подписок</TableHead>
                    <TableHead className="w-[100px]">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((cat) => (
                    <TableRow key={cat.id}>
                      <TableCell className="font-medium">{cat.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-8 h-8 rounded border border-border shrink-0"
                            style={{ backgroundColor: cat.backgroundColor }}
                            title={cat.backgroundColor}
                          />
                          <span className="text-muted-foreground text-sm font-mono">{cat.backgroundColor}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {cat._count?.subscriptions ?? 0}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Изменить"
                            onClick={() => openCategoryDialog(cat)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Удалить"
                            onClick={() => setDeleteCategoryId(cat.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderSync className="h-5 w-5" />
              Пути к видео
            </CardTitle>
            <CardDescription>
              Обновить пути к файлам в БД: заменить абсолютные пути на относительные (от папки загрузок). Запустите один раз после переноса приложения или смены DOWNLOAD_PATH.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => repairPathsMutation.mutate()}
              disabled={repairPathsMutation.isPending}
            >
              {repairPathsMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FolderSync className="mr-2 h-4 w-4" />
              )}
              Обновить пути к видео
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Аватары и превью
            </CardTitle>
            <CardDescription>
              Скачать и сохранить локально аватары каналов и превью видео, у которых ещё нет сохранённого файла (avatarPath/thumbnailPath). Заполняет папки avatars/ и thumbnails/ в каталоге загрузок.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => backfillMutation.mutate()}
              disabled={backfillMutation.isPending}
            >
              {backfillMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ImageIcon className="mr-2 h-4 w-4" />
              )}
              Докачать аватары и превью
            </Button>
          </CardContent>
        </Card>

        <Dialog open={categoryDialogOpen} onOpenChange={(open) => !open && (setCategoryDialogOpen(false), setEditingCategoryId(null))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingCategoryId ? 'Редактировать категорию' : 'Новая категория'}</DialogTitle>
              <DialogDescription>
                Название и цвет фона для карточки подписки (HEX, например #3b82f6)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="category-name">Название</Label>
                <Input
                  id="category-name"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="Например: Образование"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category-color">Цвет фона</Label>
                <div className="flex gap-2 items-center">
                  <input
                    id="category-color"
                    type="color"
                    value={categoryColor}
                    onChange={(e) => setCategoryColor(e.target.value)}
                    className="h-10 w-14 cursor-pointer rounded border border-input bg-background"
                  />
                  <Input
                    value={categoryColor}
                    onChange={(e) => setCategoryColor(e.target.value)}
                    placeholder="#e5e7eb"
                    className="font-mono flex-1"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>
                Отмена
              </Button>
              <Button
                onClick={saveCategory}
                disabled={createCategoryMutation.isPending || updateCategoryMutation.isPending}
              >
                {(createCategoryMutation.isPending || updateCategoryMutation.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingCategoryId ? 'Сохранить' : 'Создать'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteCategoryId} onOpenChange={(open) => !open && setDeleteCategoryId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить категорию?</AlertDialogTitle>
              <AlertDialogDescription>
                Подписки с этой категорией останутся, у них просто снимется привязка к категории.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteCategoryId && deleteCategoryMutation.mutate(deleteCategoryId)}
                disabled={deleteCategoryMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Удалить
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
