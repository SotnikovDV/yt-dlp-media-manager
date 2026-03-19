'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import {
  Video,
  Rss,
  Download,
  Settings,
  User,
  Shield,
  LogOut,
  Menu,
  X,
  FolderOpen,
  Tag,
  Music2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn, formatVideoTime } from '@/lib/utils';
import { VideoPlayer } from '@/components/video-player';
import { MiniAudioPlayer } from '@/components/mini-audio-player';
import { useGlobalPlayerState, useGlobalPlayerActions } from '@/lib/player-store';
import { Maximize2 } from 'lucide-react';

function GlobalMiniPlayer() {
  const { mode, currentTrack, wasFullscreenBeforeMiniplayer } = useGlobalPlayerState();
  const { setMode, clear, updateInitialTime, setAutoPlay, setPlaybackKind } = useGlobalPlayerActions();

  // Последняя известная позиция текущего трека для сохранения при закрытии/смене
  const lastPositionRef = useRef(0);

  // Текущее время и длительность для бейджа в превью мини-плеера
  const [miniCurrentTime, setMiniCurrentTime] = useState(0);
  const [miniDuration, setMiniDuration] = useState(0);


  const persistPositionById = (videoId: string, position: number) => {
    if (!videoId || !Number.isFinite(position) || position <= 0) return;
    fetch(`/api/videos/${videoId}/watch`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position: Math.floor(position), completed: false }),
    }).catch(() => {});
  };

  // Сохраняем позицию при смене трека или закрытии мини-плеера.
  // Cleanup срабатывает после рендера (DOM уже обновлён), поэтому используем lastPositionRef —
  // он обновляется в onPositionSave ещё до cleanup'а.
  useEffect(() => {
    const videoId = (currentTrack?.id || currentTrack?.src || '').split('/').pop();
    lastPositionRef.current = 0;
    return () => {
      if (videoId && lastPositionRef.current > 0) {
        persistPositionById(videoId, lastPositionRef.current);
      }
    };
  }, [currentTrack?.id, currentTrack?.src]);

  // При старте мини‑плеера:
  // - подтягиваем сохранённую позицию просмотра с сервера
  // - слушаем глобальное событие перемотки из окна описания
  useEffect(() => {
    if (!currentTrack) return;
    const src = currentTrack.id || currentTrack.src;
    const videoId = src.split('/').pop();
    if (!videoId) return;

    let cancelled = false;

    // Загрузка сохранённой позиции — пропускаем, если трек открыт с конкретным timestamp
    if (!currentTrack.skipServerPosition) {
      fetch(`/api/videos/${videoId}/watch`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { position?: number } | null) => {
          if (!data || cancelled) return;
          const pos = typeof data.position === 'number' ? data.position : 0;
          if (!Number.isFinite(pos) || pos <= 0) return;
          updateInitialTime(Math.floor(pos));
        })
        .catch(() => {});
    }

    // Слушаем глобальное событие перемотки
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ videoId?: string; seconds?: number }>).detail;
      if (!detail || typeof detail.seconds !== 'number' || detail.seconds < 0) return;
      if (detail.videoId && detail.videoId !== videoId) return;

      if (typeof document === 'undefined') return;
      const miniVideo = document.querySelector(
        '[data-player-role="mini"] video'
      ) as HTMLVideoElement | null;
      if (!miniVideo) return;

      // Перематываем видео напрямую, не трогая React-стор.
      // Изменение стора вызывало ре-рендер VideoPlayer, который сбрасывал позицию обратно.
      miniVideo.currentTime = Math.max(0, detail.seconds);

      // По спецификации: после seek всегда запускать воспроизведение —
      // и если играло (продолжить с нового места), и если стояло на паузе (начать с нового места).
      const onSeeked = () => {
        miniVideo.removeEventListener('seeked', onSeeked);
        miniVideo.play().catch(() => {});
      };
      miniVideo.addEventListener('seeked', onSeeked);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('global-player-seek', handler as EventListener);
    }

    return () => {
      cancelled = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('global-player-seek', handler as EventListener);
      }
    };
  }, [currentTrack?.id, currentTrack?.src, updateInitialTime]);

  const isVisible = mode === 'miniplayer' && currentTrack;
  if (!isVisible || !currentTrack) return null;

  const seekToChapter = (startTime: number) => {
    const t = Math.max(0, startTime);
    if (currentTrack.playbackKind === 'audio') {
      const audioEl = typeof document !== 'undefined'
        ? (document.querySelector('[data-role="mini-audio-player"] audio') as HTMLAudioElement | null)
        : null;
      if (audioEl) { audioEl.currentTime = t; setMiniCurrentTime(t); }
    } else {
      const videoEl = typeof document !== 'undefined'
        ? (document.querySelector('[data-player-role="mini"] video') as HTMLVideoElement | null)
        : null;
      if (videoEl) { videoEl.currentTime = t; setMiniCurrentTime(t); }
    }
  };

  const togglePlayPause = () => {
    if (!currentTrack || typeof document === 'undefined') return;
    if (currentTrack.playbackKind === 'audio') {
      const root = document.querySelector('[data-role="mini-audio-player"]') as HTMLElement | null;
      root?.click();
    } else {
      const el = document.querySelector('[data-player-role="mini"]') as HTMLElement | null;
      el?.click();
    }
  };

  const hasChapters = (currentTrack.chapters?.length ?? 0) > 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
      <div className="mx-auto max-w-6xl px-2 pb-2 pointer-events-auto">
        <div className="bg-black/60 text-white border border-border rounded-lg shadow-lg flex items-stretch p-0 overflow-hidden">

          {/* Превью — кликабельно для play/pause */}
          <div
            className="w-28 aspect-video shrink-0 relative bg-black cursor-pointer"
            onClick={togglePlayPause}
          >
            <div className="absolute inset-0 rounded-l-lg overflow-hidden flex items-center">
              {currentTrack.playbackKind === 'audio' && currentTrack.audioSrc ? (
                <MiniAudioPlayer
                  src={currentTrack.audioSrc}
                  title={currentTrack.title}
                  artist={currentTrack.channelName}
                  poster={currentTrack.poster}
                  initialTime={currentTrack.initialTime}
                  autoPlay={currentTrack.autoPlay}
                  onTimeUpdate={(t, d) => { setMiniCurrentTime(t); setMiniDuration(d); }}
                  onPositionSave={(pos, _completed) => {
                    lastPositionRef.current = pos;
                    updateInitialTime(pos);
                    const videoId = (currentTrack.id || currentTrack.src).split('/').pop()?.split('?')[0];
                    persistPositionById(videoId || '', pos);
                  }}
                />
              ) : (
                <VideoPlayer
                  src={currentTrack.videoSrc || currentTrack.src}
                  title={currentTrack.title}
                  channelName={currentTrack.channelName}
                  channelId={currentTrack.channelId}
                  poster={currentTrack.poster}
                  publishedAt={currentTrack.publishedAt}
                  chapters={currentTrack.chapters}
                  initialTime={currentTrack.initialTime}
                  fillContainer
                  mini
                  autoPlay={currentTrack.autoPlay}
                  onTimeUpdate={(t, d) => { setMiniCurrentTime(t); setMiniDuration(d); }}
                  onPositionSave={(pos) => {
                    lastPositionRef.current = pos;
                    const videoEl = typeof document !== 'undefined'
                      ? (document.querySelector('[data-player-role="mini"] video') as HTMLVideoElement | null)
                      : null;
                    const actualSrc = videoEl?.currentSrc || '';
                    const trackSrc = currentTrack.id || currentTrack.src;
                    const actualId = actualSrc.split('/').pop()?.split('?')[0];
                    const trackId = trackSrc.split('/').pop()?.split('?')[0];
                    if (!actualId || actualId === trackId) updateInitialTime(pos);
                    persistPositionById(actualId || trackId || '', pos);
                  }}
                />
              )}
            </div>
            {/* Бейдж времени — только информационный */}
            {miniDuration > 0 && (
              <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 z-10 bg-black/50 rounded px-1 py-0.5 text-[10px] text-white tabular-nums leading-none pointer-events-none select-none whitespace-nowrap">
                {formatVideoTime(miniCurrentTime, miniDuration)}
                <span className="text-white/60 mx-0.5">/</span>
                {formatVideoTime(miniDuration, miniDuration)}
              </div>
            )}
          </div>

          {/* Центр: заголовок + канал.
              Если есть тайм-коды — клик открывает меню эпизодов.
              Иначе — клик play/pause. */}
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5 px-3 py-2">
            {hasChapters ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer select-none outline-none group"
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click(); }}
                  >
                    <div className="text-sm font-medium leading-tight line-clamp-2 group-hover:text-white/75 transition-colors">
                      {currentTrack.title}
                    </div>
                    {currentTrack.channelName && (
                      <div className="text-xs text-white/50 truncate">{currentTrack.channelName}</div>
                    )}
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  side="top"
                  className="max-h-[280px] w-[300px] overflow-y-auto text-xs bg-black/90 text-white border border-white/20 shadow-lg rounded-md backdrop-blur-sm"
                >
                  {currentTrack.chapters!.map((ch, idx) => (
                    <DropdownMenuItem
                      key={`${ch.startTime}-${idx}`}
                      className="flex items-start gap-2 py-1.5 px-2 rounded-sm focus:bg-white/15 focus:text-white data-highlighted:bg-white/15 data-highlighted:text-white cursor-pointer"
                      onClick={() => seekToChapter(ch.startTime ?? 0)}
                    >
                      <span className="font-mono text-white/60 shrink-0 text-[11px] pt-px">
                        {formatVideoTime(ch.startTime ?? 0, miniDuration)}
                      </span>
                      <span className="text-white/90 line-clamp-2 wrap-break-word">
                        {ch.title || '\u00A0'}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div
                className="cursor-pointer group"
                onClick={togglePlayPause}
              >
                <div className="text-sm font-medium leading-tight line-clamp-2 group-hover:text-white/75 transition-colors">
                  {currentTrack.title}
                </div>
                {currentTrack.channelName && (
                  <div className="text-xs text-white/50 truncate">{currentTrack.channelName}</div>
                )}
              </div>
            )}
          </div>

          {/* Правая часть: кнопки по центру высоты */}
          <div className="flex items-center gap-0.5 pr-2 shrink-0">
            {/* Переключатель видео/аудио */}
            {currentTrack.audioSrc && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Переключить режим Видео/Аудио"
                onClick={() => { setPlaybackKind(currentTrack.playbackKind === 'audio' ? 'video' : 'audio'); setAutoPlay(true); }}
                aria-label={currentTrack.playbackKind === 'audio' ? 'Переключить на видео' : 'Переключить на аудио'}
              >
                {currentTrack.playbackKind === 'audio' ? <Video className="h-4 w-4" /> : <Music2 className="h-4 w-4" />}
              </Button>
            )}

            {/* Развернуть */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="Развернуть"
              onClick={() => {
                const shouldFullscreen = wasFullscreenBeforeMiniplayer;
                setAutoPlay(true);
                setMode('embedded');
                if (typeof document !== 'undefined' && shouldFullscreen) {
                  setTimeout(() => {
                    const el = document.querySelector('[data-player-role="primary"]') as HTMLElement | null;
                    el?.requestFullscreen().catch(() => {});
                  }, 0);
                }
              }}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>

            {/* Закрыть */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="Закрыть"
              onClick={() => {
                clear();
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('global-mini-player-close'));
                }
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

        </div>
      </div>
    </div>
  );
}

const NAV_ITEMS = [
  { id: 'library', label: 'Медиатека', href: '/library' },
  { id: 'subscriptions', label: 'Подписки', href: '/subscriptions' },
  { id: 'queue', label: 'Очередь', href: '/queue' },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { mode: globalPlayerMode, currentTrack } = useGlobalPlayerState();
  const isMiniPlayerVisible = globalPlayerMode === 'miniplayer' && !!currentTrack;

  const userDisplay = session?.user?.name || session?.user?.email || (session?.user as { username?: string })?.username || 'Пользователь';
  const userId = (session?.user as { id?: string })?.id;
  const avatarSrc = userId ? `/api/avatar/${userId}` : undefined;
  const initials = String(userDisplay || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');
  const isAdmin = (session?.user as { isAdmin?: boolean })?.isAdmin === true;

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpenHeader, setUserMenuOpenHeader] = useState(false);
  const [userMenuOpenSidebar, setUserMenuOpenSidebar] = useState(false);

  // Позволяет дочерним страницам (например, через createPortal) закрывать
  // мобильное меню при нажатии на глобальные действия.
  useEffect(() => {
    const handler = () => setMobileMenuOpen(false);
    if (typeof window !== 'undefined') {
      window.addEventListener('global-mobile-menu-close', handler as EventListener);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(
          'global-mobile-menu-close',
          handler as EventListener,
        );
      }
    };
  }, []);

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      const res = await fetch('/api/stats');
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
  });

  const { data: tagsData } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const res = await fetch('/api/tags');
      if (!res.ok) throw new Error('Failed to fetch tags');
      return res.json() as Promise<{ tags: { id: string; name: string; count: number }[] }>;
    },
  });

  const renderUserMenu = (opts: { compact?: boolean; open?: boolean; onOpenChange?: (open: boolean) => void }) => {
    const { compact, open, onOpenChange } = opts;
    if (!userId) return null;
    return (
      <DropdownMenu open={open} onOpenChange={(v) => onOpenChange?.(v)}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn('rounded-full cursor-pointer', compact ? '' : 'ml-auto')}
            title={userDisplay}
          >
            <Avatar className="h-8 w-8">
              <AvatarImage src={avatarSrc} alt={userDisplay} />
              <AvatarFallback className="text-xs">
                {initials || <User className="h-4 w-4" />}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate">{userDisplay}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/profile">
              <User className="mr-2 h-4 w-4" />
              Профиль
            </Link>
          </DropdownMenuItem>
          {isAdmin && (
            <>
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Настройки
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/admin">
                  <Shield className="mr-2 h-4 w-4" />
                  Админка
                </Link>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/login' })}>
            <LogOut className="mr-2 h-4 w-4" />
            Выйти
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const isNavActive = (item: (typeof NAV_ITEMS)[number]) => pathname === item.href;
  const activeNavLabel = NAV_ITEMS.find((item) => isNavActive(item))?.label;

  return (
    <div className="min-h-screen bg-background">
      {/* Мобильная шапка — Material top app bar */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 surface elevation-2 z-50 flex items-center px-4">
        <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
        <div className="ml-2 flex flex-col leading-tight">
          <h1 className="text-base font-medium tracking-tight">Media Manager</h1>
          {activeNavLabel && (
            <span className="text-xs text-muted-foreground">{activeNavLabel}</span>
          )}
        </div>
        <div className="ml-auto">
          {renderUserMenu({ compact: true, open: userMenuOpenHeader, onOpenChange: setUserMenuOpenHeader })}
        </div>
      </header>

      {/* Мобильное меню */}
      <div
        className={cn(
          'lg:hidden fixed inset-0 top-16 bg-background z-40 p-4 transition-opacity',
          mobileMenuOpen ? 'block' : 'hidden',
        )}
      >
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              onClick={() => setMobileMenuOpen(false)}
              className={cn(
                'flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors',
                isNavActive(item)
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground hover:bg-muted'
              )}
            >
              {item.id === 'library' && <Video className="h-5 w-5 shrink-0" />}
              {item.id === 'subscriptions' && <Rss className="h-5 w-5 shrink-0" />}
              {item.id === 'queue' && <Download className="h-5 w-5 shrink-0" />}
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Сюда страница подставляет глобальные действия на мобилке */}
        <div id="mobile-actions-slot" className="mt-4 pt-4 border-t border-border/80" />
      </div>

      {/* Десктопный сайдбар — Material navigation drawer */}
      <aside
        className={cn(
          'hidden lg:flex flex-col fixed left-0 top-0 h-full surface border-r border-border/80 shadow-elevation-1 z-50 transition-all duration-300',
          sidebarOpen ? 'w-64' : 'w-16'
        )}
      >
        <div className="p-4 border-b border-border/80 flex items-center justify-between min-h-[56px]">
          {sidebarOpen && (
            <Link href="/library" className="text-xl font-medium tracking-tight text-foreground hover:text-primary transition-colors">
              Media Manager
            </Link>
          )}
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <FolderOpen className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 p-2 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                'flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors',
                sidebarOpen ? 'px-3 gap-3' : 'px-0 justify-center',
                isNavActive(item)
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground hover:bg-muted'
              )}
            >
              {item.id === 'library' && <Video className={cn('h-5 w-5 shrink-0', sidebarOpen && 'ml-0')} />}
              {item.id === 'subscriptions' && <Rss className={cn('h-5 w-5 shrink-0', sidebarOpen && 'ml-0')} />}
              {item.id === 'queue' && <Download className={cn('h-5 w-5 shrink-0', sidebarOpen && 'ml-0')} />}
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>

        {sidebarOpen && tagsData?.tags && tagsData.tags.length > 0 && (
          <div className="px-3 py-2 border-t border-border/80">
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <Tag className="h-3.5 w-5" />
              Теги
            </p>
            <div className="flex flex-wrap gap-0.5">
              {tagsData.tags.map((tag) => {
                const maxCount = Math.max(...tagsData.tags!.map((t) => t.count), 1);
                const weight = maxCount > 1 ? 0.7 + (0.3 * tag.count) / (maxCount * 2) : 1;
                return (
                  <Link
                    key={tag.id}
                    href={`/library?tagId=${encodeURIComponent(tag.id)}`}
                    className={cn(
                      'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-colors',
                      'bg-muted/80 text-muted-foreground hover:bg-primary/15 hover:text-primary'
                    )}
                    style={{ opacity: weight }}
                    title={`${tag.name} (${tag.count})`}
                  >
                    {tag.name}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {sidebarOpen && stats && stats.videos != null && stats.channels != null && (
          <div className="p-4 border-t border-border/80 space-y-2 text-sm text-muted-foreground">
            <div className="flex justify-between">
              <span>Видео:</span>
              <span className="font-medium text-foreground">{stats.videos?.count ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span>Загрузок:</span>
              <span className="font-medium text-foreground">{stats?.queue?.active ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span>Размер:</span>
              <span className="font-medium text-foreground">{stats.videos?.totalSizeFormatted ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span>Подписки:</span>
              <span className="font-medium text-foreground">{stats.channels?.subscriptions ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span>Обновление:</span>
              <span className="font-medium text-foreground text-right truncate min-w-0 ml-2">
                {stats.channels?.lastCheckAt
                  ? new Date(stats.channels.lastCheckAt)
                      .toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        year: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                      .replace(', ', ' ')
                  : '—'}
              </span>
            </div>
            {stats.disk && (
              <div className="flex justify-between">
                <span>Диск:</span>
                <span className="font-medium text-foreground">{stats.disk.freeFormatted}</span>
              </div>
            )}
          </div>
        )}

        <div className={cn('border-t border-border/80 p-3 flex items-center', sidebarOpen ? 'justify-between' : 'justify-center')}>
          {sidebarOpen ? (
            <div className="min-w-0">
              <p className="text-sm font-medium truncate text-foreground">{userDisplay}</p>
              <p className="text-xs text-muted-foreground truncate">{session?.user?.email || ''}</p>
            </div>
          ) : null}
          {renderUserMenu({ open: userMenuOpenSidebar, onOpenChange: setUserMenuOpenSidebar })}
        </div>
      </aside>

      <main
        className={cn(
          'transition-all duration-300 pt-16 lg:pt-0 min-h-screen',
          sidebarOpen ? 'lg:ml-64' : 'lg:ml-16',
          isMiniPlayerVisible && 'pb-28'
        )}
      >
        <div className="py-2 px-3 lg:px-4 lg:pb-4 lg:pt-0">{children}</div>
      </main>
      <GlobalMiniPlayer />
    </div>
  );
}
