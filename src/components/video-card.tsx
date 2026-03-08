'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Play, Video, CheckCircle, Star, Trash2, Download, ExternalLink, Share2, Eye, ListPlus, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShareVideoMenu } from '@/components/share-video-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

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
  watchHistory?:
    | { position: number; completed: boolean; watchCount: number }
    | { position: number; completed: boolean; watchCount: number }[]
    | null;
  favorites?: { id: string }[];
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
  /** Базовый URL приложения для меню «Поделиться» (В Telegram / Скопировать ссылку). Если задан, кнопка «Поделиться» открывает выбор варианта. */
  shareBaseUrl?: string;
  /** Плейлисты и колбэки для кнопки «Добавить в плейлист». Если заданы, кнопка показывается вверху карточки справа от «Поделиться». */
  playlists?: PlaylistForCard[];
  onAddToPlaylist?: (playlistId: string, videoId: string) => void;
  onCreatePlaylistAndAdd?: (videoId: string, suggestedName?: string) => void;
  onDelete?: (videoId: string) => void;
  showFavoriteButton?: boolean;
}

export function VideoCard<T extends VideoCardVideo>({
  video,
  onPlay,
  onFavorite,
  shareBaseUrl,
  playlists,
  onAddToPlaylist,
  onCreatePlaylistAndAdd,
  onDelete,
  showFavoriteButton = false,
}: VideoCardProps<T>) {
  const watchRecord = Array.isArray(video.watchHistory) ? video.watchHistory[0] : video.watchHistory;
  const isFavorite = Array.isArray(video.favorites) && video.favorites.length > 0;
  const [playlistMenuOpen, setPlaylistMenuOpen] = useState(false);
  const thumbnailSrc =
    (video.filePath || video.thumbnailUrl) ? `/api/thumbnail/${video.id}` : null;

  return (
    <Card
      className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow group h-full flex flex-col aspect-3/4 gap-0 py-0"
      onClick={() => onPlay(video)}
    >
      {/* Блок превью — 50% высоты карточки, картинка по центру по вертикали */}
      <div className="relative flex-[0_0_60%] min-h-0 flex items-center justify-center bg-muted overflow-hidden">
        {/* Кнопки в правом верхнем углу — прозрачный фон, матовое стекло только при наведении */}
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
          {video.platformId && (
            <a
              href={`https://www.youtube.com/watch?v=${video.platformId}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Открыть источник"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center justify-center w-8 h-8 rounded-md text-white transition-all duration-200 hover:bg-white/25 hover:backdrop-blur-md"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {shareBaseUrl && (
            <ShareVideoMenu
              videoId={video.id}
              title={video.title}
              baseUrl={shareBaseUrl}
            >
              <button
                type="button"
                title="Поделиться"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center justify-center w-8 h-8 rounded-md text-white transition-all duration-200 hover:bg-white/25 hover:backdrop-blur-md"
              >
                <Share2 className="h-3.5 w-3.5" />
              </button>
            </ShareVideoMenu>
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
                      disabled={alreadyIn}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (alreadyIn) return;
                        setPlaylistMenuOpen(false);
                        onAddToPlaylist(pl.id, video.id);
                      }}
                    >
                      {pl.name}
                      {alreadyIn && ' ✓'}
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
          {watchRecord?.completed && (
            <span className="flex items-center justify-center w-8 h-8">
              <CheckCircle className="h-5 w-5 text-green-500" />
            </span>
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
      <CardContent className="p-3 flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-h-0">
          <h3 className="font-medium text-sm line-clamp-2">{video.title}</h3>
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            {video.channel?.id ? (
              <Link
                href={`/library?channelId=${encodeURIComponent(video.channel.id)}`}
                onClick={(e) => e.stopPropagation()}
                className="hover:underline focus:underline outline-none"
              >
                {video.channel.name}
              </Link>
            ) : (
              <span>{video.channel?.name || 'Без канала'}</span>
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
        <div className="flex flex-wrap gap-2 mt-2 shrink-0">
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
          {video.filePath && (
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0"
              asChild
            >
              <a
                href={`/api/stream/${video.id}?download=1`}
                target="_blank"
                rel="noopener noreferrer"
                title="Скачать на ПК"
                onClick={(e) => e.stopPropagation()}
              >
                <Download className="h-3 w-3" />
              </a>
            </Button>
          )}
          {onDelete && (
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(video.id);
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
