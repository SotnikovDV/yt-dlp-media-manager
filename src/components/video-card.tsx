'use client';

import React from 'react';
import { Play, Video, CheckCircle, Star, Share2, Trash2, Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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

/** Минимальный тип видео для карточки; совместим с VideoType из page */
export interface VideoCardVideo {
  id: string;
  title: string;
  duration: number | null;
  thumbnailUrl: string | null;
  filePath: string | null;
  fileSize: bigint | null;
  publishedAt: Date | string | null;
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
  onShare?: (video: T) => void;
  onDelete?: (videoId: string) => void;
  showFavoriteButton?: boolean;
}

export function VideoCard<T extends VideoCardVideo>({
  video,
  onPlay,
  onFavorite,
  onShare,
  onDelete,
  showFavoriteButton = false,
}: VideoCardProps<T>) {
  const watchRecord = Array.isArray(video.watchHistory) ? video.watchHistory[0] : video.watchHistory;
  const isFavorite = Array.isArray(video.favorites) && video.favorites.length > 0;
  const thumbnailSrc =
    (video.filePath || video.thumbnailUrl) ? `/api/thumbnail/${video.id}` : null;

  return (
    <Card
      className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow group h-full flex flex-col aspect-3/4 gap-0 py-0"
      onClick={() => onPlay(video)}
    >
      {/* Блок превью — 50% высоты карточки, картинка по центру по вертикали */}
      <div className="relative flex-[0_0_60%] min-h-0 flex items-center justify-center bg-muted overflow-hidden">
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
        {watchRecord?.completed && (
          <span className="absolute top-2 right-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
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
            <span>{video.channel?.name || 'Без канала'}</span>
            {video.fileSize != null && <span>{formatBytes(video.fileSize)}</span>}
          </div>
          {video.publishedAt && (
            <p className="text-xs text-muted-foreground mt-1">
              Опубликовано: {formatDate(video.publishedAt)}
            </p>
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
          {onShare && (
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onShare(video);
              }}
              title="Поделиться"
            >
              <Share2 className="h-3 w-3" />
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
