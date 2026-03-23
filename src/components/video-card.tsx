'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Play, Video, Star, Trash2, Download, ExternalLink, Share2, Eye, ListPlus, Plus, X, MoreVertical, Tag, MessageCircle, Link2, Pin, Music2, Loader2, Cast } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { withAudioDownloadSlot } from '@/lib/client-audio-download-queue';
import { fetchAndSavePreparedAudio } from '@/lib/prepared-audio-download';
import { useChromecast } from '@/lib/use-chromecast';

function buildWatchUrl(baseUrl: string, videoId: string): string {
  return `${baseUrl.replace(/\/$/, '')}/watch/${videoId}`;
}

function openTelegramShare(url: string, text: string): void {
  const u = new URL('https://t.me/share/url');
  u.searchParams.set('url', url);
  u.searchParams.set('text', text);
  window.open(u.toString(), '_blank', 'noopener,noreferrer');
}

function copyToClipboard(url: string): void {
  navigator.clipboard.writeText(url).then(
    () => toast.success('Ссылка скопирована'),
    () => toast.error('Не удалось скопировать')
  );
}

/** Плейлист для кнопки «Добавить в плейлист» (из API). */
export interface PlaylistForCard {
  id: string;
  name: string;
  videoIds: string[];
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(date: Date | string | null): string {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatBytes(bytes: number | bigint | null): string {
  if (!bytes) return '';
  const b = Number(bytes);
  if (b === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatViews(views: number | bigint | string | null | undefined): string {
  if (views == null || views === '') return '';
  const v = Number(views);
  if (!Number.isFinite(v) || v <= 0) return '';
  if (v < 1000) return v.toString();
  const thousands = v / 1000;
  const value = thousands >= 10 ? Math.round(thousands).toString() : thousands.toFixed(1);
  return `${value.replace('.', ',')} тыс.`;
}

function hexToRgba(color: string, alpha: number): string {
  if (!color) return `rgba(0, 0, 0, ${alpha})`;
  let hex = color.trim();
  if (hex.startsWith('#')) hex = hex.slice(1);
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  if (hex.length !== 6) {
    return `rgba(0, 0, 0, ${alpha})`;
  }
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return `rgba(0, 0, 0, ${alpha})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function CategoryBookmarkBadge({ baseColor }: { baseColor: string }) {
  const fill = hexToRgba(baseColor, 0.9);
  const stroke = hexToRgba(baseColor, 0.3);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 32"
      className="-mt-2 ml-1 w-8 h-[32px]"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M6 3 H18 V26 L12 21 L6 26 Z"
        style={{ fill, stroke: 'none' }}
      />
      <path
        d="M6 3 H18 V26 L12 21 L6 26 Z"
        style={{
          fill: 'none',
          stroke,
          strokeWidth: 1,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }}
      />
    </svg>
  );
}

/** Минимальный тип видео для карточки; совместим с VideoType из page */
export interface VideoCardVideo {
  id: string;
  title: string;
  duration: number | null;
  thumbnailUrl: string | null;
  filePath: string | null;
  fileSize: bigint | null;
  publishedAt: Date | string | null;
   viewCount?: number | bigint | string | null;
  channel: { id: string; name: string; avatarUrl: string | null } | null;
  /** Категория подписки/канала, из которой пришло видео (для цветной метки). */
  subscriptionCategory?: { id: string; name: string; backgroundColor: string } | null;
  watchHistory?:
    | { position: number; completed: boolean; watchCount: number }
    | { position: number; completed: boolean; watchCount: number }[]
    | null;
  favorites?: { id: string }[];
  bookmarks?: { id: string }[];
  pins?: { id: string }[];
  platformId?: string;
  description?: string | null;
  quality?: string | null;
  format?: string | null;
  downloadedAt?: Date | string | null;
}

export interface VideoCardProps<T extends VideoCardVideo = VideoCardVideo> {
  video: T;
  onPlay: (video: T) => void;
  onFavorite?: (video: T, isFavorite: boolean) => void;
  onBookmark?: (video: T, isBookmarked: boolean) => void;
  onShowDescription?: (video: T) => void;
  /** Базовый URL приложения для подменю «Поделиться» в меню действий (В Telegram / Скопировать ссылку). */
  shareBaseUrl?: string;
  /** Плейлисты и колбэки для кнопки «Добавить в плейлист» в углу превью. */
  playlists?: PlaylistForCard[];
  onAddToPlaylist?: (playlistId: string, videoId: string) => void;
  onRemoveFromPlaylist?: (playlistId: string, videoId: string) => void;
  onCreatePlaylistAndAdd?: (videoId: string, suggestedName?: string) => void;
  onDelete?: (videoId: string) => void;
  onToggleWatched?: (videoId: string, completed: boolean) => void;
  onToggleKeep?: (videoId: string, pinned: boolean) => void;
  showFavoriteButton?: boolean;
}

export function VideoCard<T extends VideoCardVideo>({
  video,
  onPlay,
  onFavorite,
  onBookmark,
  onShowDescription,
  shareBaseUrl,
  playlists,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  onCreatePlaylistAndAdd,
  onDelete,
  onToggleWatched,
  onToggleKeep,
  showFavoriteButton = false,
}: VideoCardProps<T>) {
  const watchRecord = Array.isArray(video.watchHistory) ? video.watchHistory[0] : video.watchHistory;
  const isFavorite = Array.isArray(video.favorites) && video.favorites.length > 0;
  const isBookmarked = Array.isArray(video.bookmarks) && video.bookmarks.length > 0;
  const isPinned = Array.isArray(video.pins) && video.pins.length > 0;
  const [playlistMenuOpen, setPlaylistMenuOpen] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [watchedOverride, setWatchedOverride] = useState<boolean | null>(null);
  const [pinnedOverride, setPinnedOverride] = useState<boolean | null>(null);
  const [favoriteOverride, setFavoriteOverride] = useState<boolean | null>(null);
  const [bookmarkedOverride, setBookmarkedOverride] = useState<boolean | null>(null);
  const [audioDownloadBusy, setAudioDownloadBusy] = useState(false);
  const chromecast = useChromecast();
  const thumbnailSrc =
    (video.filePath || video.thumbnailUrl) ? `/api/thumbnail/${video.id}` : null;

  const isFavoriteEffective = favoriteOverride ?? isFavorite;
  const isBookmarkedEffective = bookmarkedOverride ?? isBookmarked;
  const isViewed = watchedOverride ?? (watchRecord?.completed === true);
  const isKept = pinnedOverride ?? isPinned;
  const isNew =
    !isViewed &&
    video.downloadedAt != null &&
    Date.now() - new Date(video.downloadedAt).getTime() < 24 * 60 * 60 * 1000;
  const badgeColor = isViewed ? '#6B7280' : isNew ? '#EAB308' : null;

  return (
    <Card
      className="relative isolate overflow-hidden cursor-pointer hover:shadow-lg transition-shadow group h-full flex flex-col gap-0 py-0" /** aspect-1/2  **/
      onClick={() => onPlay(video)}
    >
      {badgeColor && (
        <div className="pointer-events-none absolute top-0 left-0 z-10">
          <CategoryBookmarkBadge baseColor={badgeColor} />
        </div>
      )}
      {/* Блок превью — 50% высоты карточки, картинка по центру по вертикали */}
      <div className="relative flex-[0_0_50%] min-h-0 flex items-center justify-center bg-muted overflow-hidden">
        {/* Кнопки в правом верхнем углу — прозрачный фон, матовое стекло только при наведении */}
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
          {onBookmark && (
            <button
              type="button"
              title={
                isBookmarkedEffective ? 'Убрать из закреплённых' : 'Закрепить'
              }
              onClick={(e) => {
                e.stopPropagation();
                const next = !isBookmarkedEffective;
                setBookmarkedOverride(next);
                onBookmark(video, next);
              }}
              className="flex items-center justify-center w-8 h-8 rounded-md text-white transition-all duration-200 hover:bg-white/25 hover:backdrop-blur-md"
            >
              <Pin
                className={cn(
                  'h-3.5 w-3.5',
                  isBookmarkedEffective
                    ? 'fill-white text-white'
                    : 'text-white/90',
                )}
              />
            </button>
          )}
          {playlists != null && onAddToPlaylist && onCreatePlaylistAndAdd && (
            <DropdownMenu open={playlistMenuOpen} onOpenChange={setPlaylistMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title="Добавить в плейлист"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center justify-center w-8 h-8 rounded-md text-white transition-all duration-200 hover:bg-white/25 hover:backdrop-blur-md"
                >
                  <ListPlus className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
                {playlists.map((pl) => {
                  const alreadyIn = pl.videoIds.includes(video.id);
                  return (
                    <DropdownMenuItem
                      key={pl.id}
                      disabled={alreadyIn && !onRemoveFromPlaylist}
                      className="flex items-center justify-between gap-2"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (alreadyIn) return;
                        setPlaylistMenuOpen(false);
                        onAddToPlaylist(pl.id, video.id);
                      }}
                    >
                      <span>
                        {pl.name}
                        {alreadyIn && ' ✓'}
                      </span>
                      {alreadyIn && onRemoveFromPlaylist && (
                        <button
                          type="button"
                          title="Удалить из плейлиста"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setPlaylistMenuOpen(false);
                            onRemoveFromPlaylist(pl.id, video.id);
                          }}
                          className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const name = window.prompt('Название плейлиста', video.title.slice(0, 50));
                    if (name != null && name.trim()) {
                      setPlaylistMenuOpen(false);
                      onCreatePlaylistAndAdd(video.id, name.trim());
                    }
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Новый плейлист
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {thumbnailSrc ? (
          <img
            src={thumbnailSrc}
            alt={video.title}
            className="w-full h-full object-cover object-center"
            onError={(e) => {
              if (video.thumbnailUrl && e.currentTarget.src !== video.thumbnailUrl) {
                e.currentTarget.src = video.thumbnailUrl;
              }
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full w-full">
            <Video className="h-12 w-12 text-muted-foreground" />
          </div>
        )}
        {video.duration != null && video.duration > 0 && (
          <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
            {formatDuration(video.duration)}
          </span>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
          <Play className="h-12 w-12 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
      <CardContent className="px-0 py-3 flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 border-b px-3 min-h-0">
          <div className="flex items-start gap-1">
            <h3
              className={cn(
                'font-medium text-sm line-clamp-2 flex-1',
                video.description && onShowDescription && 'underline-offset-2 hover:underline cursor-pointer'
              )}
              onClick={
                video.description && onShowDescription
                  ? (e) => {
                      e.stopPropagation();
                      onShowDescription(video);
                    }
                  : undefined
              }
            >
              {video.title}
            </h3>
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            {video.channel?.id ? (
              <Link
                href={`/library?channelId=${encodeURIComponent(video.channel.id)}`}
                onClick={(e) => e.stopPropagation()}
                className="hover:underline focus:underline outline-none text-sm font-medium"
                title={video.subscriptionCategory?.name || undefined}
              >
                {video.channel.name}
              </Link>
            ) : (
              <span title={video.subscriptionCategory?.name || undefined}>
                {video.channel?.name || 'Без канала'}
              </span>
            )}
            {video.fileSize != null && <span>{formatBytes(video.fileSize)}</span>}
          </div>
          {(video.publishedAt || video.viewCount != null) && (
            <div className="mt-1 flex items-center text-xs text-muted-foreground">
              {video.publishedAt && (
                <span className="whitespace-nowrap">
                  Опубликовано: {formatDate(video.publishedAt)}
                </span>
              )}
              <span className="ml-auto flex items-center gap-1 whitespace-nowrap">
                {video.viewCount != null && (
                  <>
                    <Eye className="h-3 w-3" />
                    {formatViews(video.viewCount)}
                  </>
                )}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-3 mt-2 px-3 shrink-0">
          
          {showFavoriteButton && onFavorite && (
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onFavorite(video, !isFavorite);
              }}
              title={isFavorite ? 'Убрать из избранного' : 'В избранное'}
            >
              <Star
                className={cn('h-3 w-3', isFavorite && 'fill-amber-500 text-amber-500')}
              />
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            className="flex-1 min-w-0 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onPlay(video);
            }}
          >
            <Play className="h-3 w-3 mr-1 shrink-0" />
            Смотреть
          </Button>
          {(video.filePath || onDelete || video.platformId || shareBaseUrl) && (
            <DropdownMenu open={contextMenuOpen} onOpenChange={setContextMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0"
                  onClick={(e) => e.stopPropagation()}
                  title="Действия"
                >
                  <MoreVertical className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onClick={(e) => e.stopPropagation()}
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Tag className="h-4 w-4 shrink-0" />
                    Атрибуты
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem
                      disabled={!onFavorite}
                      className="pl-8 relative"
                      onClick={() => {
                        const next = !isFavoriteEffective;
                        setFavoriteOverride(next);
                        onFavorite?.(video, next);
                      }}
                    >
                      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
                        <Star className={cn(
                          'h-3.5 w-3.5',
                          isFavoriteEffective
                            ? 'fill-amber-500 text-amber-500'
                            : 'text-muted-foreground'
                        )} />
                      </span>
                      Избранное
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!onBookmark}
                      className="pl-8 relative"
                      onClick={() => {
                        const next = !isBookmarkedEffective;
                        setBookmarkedOverride(next);
                        onBookmark?.(video, next);
                      }}
                    >
                      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
                        <Pin className={cn(
                          'h-3.5 w-3.5',
                          isBookmarkedEffective
                            ? 'fill-slate-500 text-slate-600'
                            : 'text-muted-foreground'
                        )} />
                      </span>
                      Закрепить
                    </DropdownMenuItem>
                    <DropdownMenuCheckboxItem
                      checked={isViewed}
                      disabled={!onToggleWatched}
                      onCheckedChange={(checked) => {
                        setWatchedOverride(checked);
                        onToggleWatched?.(video.id, checked);
                      }}
                    >
                      Просмотрено
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={isKept}
                      disabled={!onToggleKeep}
                      onCheckedChange={(checked) => {
                        setPinnedOverride(checked);
                        onToggleKeep?.(video.id, checked);
                      }}
                    >
                      Не очищать
                    </DropdownMenuCheckboxItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                {chromecast.isAvailable && shareBaseUrl && (
                  <DropdownMenuItem
                    onClick={async () => {
                      setContextMenuOpen(false);
                      const origin = shareBaseUrl.replace(/\/$/, '');
                      const streamUrl = `${origin}/api/stream/${video.id}`;
                      const posterUrl = thumbnailSrc
                        ? `${origin}${thumbnailSrc}`
                        : undefined;
                      try {
                        await chromecast.castMedia({
                          contentId: streamUrl,
                          title: video.title,
                          posterUrl,
                        });
                      } catch {
                        toast.error('Не удалось передать на Chromecast');
                      }
                    }}
                  >
                    <Cast className="h-4 w-4 shrink-0" />
                    Транслировать
                  </DropdownMenuItem>
                )}
                {shareBaseUrl && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Share2 className="h-4 w-4 shrink-0" />
                      Поделиться
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem
                        onClick={() => {
                          setContextMenuOpen(false);
                          openTelegramShare(buildWatchUrl(shareBaseUrl, video.id), video.title);
                        }}
                      >
                        <MessageCircle className="h-4 w-4 shrink-0" />
                        В Telegram
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setContextMenuOpen(false);
                          copyToClipboard(buildWatchUrl(shareBaseUrl, video.id));
                        }}
                      >
                        <Link2 className="h-4 w-4 shrink-0" />
                        Скопировать ссылку
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                {video.filePath && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Download className="h-4 w-4 shrink-0" />
                      Скачать
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem asChild>
                        <a
                          href={`/api/stream/${video.id}?download=1`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setContextMenuOpen(false)}
                        >
                          <Video className="h-4 w-4 shrink-0" />
                          Видео
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={audioDownloadBusy}
                        title="AAC (.m4a). Ход подготовки — пульсация «Media Manager» в шапке. Битрейт и моно — в Настройках (админ) или AUDIO_EXTRACT_AAC_* в .env.local."
                        onClick={() => {
                          if (audioDownloadBusy) return;
                          setContextMenuOpen(false);
                          setAudioDownloadBusy(true);
                          withAudioDownloadSlot(() => fetchAndSavePreparedAudio(video))
                            .catch(() => {})
                            .finally(() => setAudioDownloadBusy(false));
                        }}
                      >
                        {audioDownloadBusy ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                        ) : (
                          <Music2 className="h-4 w-4 shrink-0" />
                        )}
                        Аудио
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                {video.platformId && (
                  <DropdownMenuItem asChild>
                    <a
                      href={`https://www.youtube.com/watch?v=${video.platformId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setContextMenuOpen(false)}
                    >
                      <ExternalLink className="h-4 w-4 shrink-0" />
                      Открыть на Youtube
                    </a>
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => {
                        setContextMenuOpen(false);
                        onDelete(video.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 shrink-0" />
                      Удалить
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          
        </div>
      </CardContent>
    </Card>
  );
}
