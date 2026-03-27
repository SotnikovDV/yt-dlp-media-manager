'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ShareVideoMenu } from '@/components/share-video-menu';
import {
  Star,
  Pin,
  Shield,
  Share2,
  Download,
  Video,
  Music2,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { HelpDocLink } from '@/components/help-doc-link';
import { withAudioDownloadSlot } from '@/lib/client-audio-download-queue';
import { fetchAndSavePreparedAudio } from '@/lib/prepared-audio-download';

export interface VideoDescriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Колбэк для перемотки текущего плеера к указанному времени (в секундах). */
  onSeekToTimeInSeconds?: (seconds: number) => void;
  /**
   * Действия под заголовком. Если не передано — блок кнопок скрыт.
   */
  actions?: VideoDescriptionActions;
}

export interface VideoDescriptionToggleAction {
  active: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export interface VideoDescriptionActions {
  favorite?: VideoDescriptionToggleAction;
  bookmark?: VideoDescriptionToggleAction;
  keep?: VideoDescriptionToggleAction;
  /** Поделиться: watch-ссылка приложения */
  share?: { videoId: string; title: string; baseUrl: string };
  /** Локальный файл есть — видео + аудио */
  download?: { videoId: string; title: string; platformId?: string };
  youtubeUrl?: string | null;
}

const urlRegex = /(https?:\/\/[^\s]+)/g;

function renderTextWithUrls(text: string, keyPrefix: string) {
  if (!text) return null;
  const parts = text.split(urlRegex);
  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={`${keyPrefix}-url-${index}`}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 break-all"
        >
          {part}
        </a>
      );
    }
    return (
      <React.Fragment key={`${keyPrefix}-text-${index}`}>{part}</React.Fragment>
    );
  });
}

/** Парсит тайм-код в начале строки и возвращает секунды или null. */
function parseLeadingTimestamp(line: string): { seconds: number; rest: string } | null {
  const match = line.match(/^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?(.*)$/);
  if (!match) return null;
  const [, hStr, mStr, sStr, tail] = match;
  const hours = sStr != null ? Number(hStr) || 0 : 0;
  const minutes = sStr != null ? Number(mStr) || 0 : Number(hStr) || 0;
  const seconds = sStr != null ? Number(sStr) || 0 : Number(mStr) || 0;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return null;

  let rest = tail ?? '';
  rest = rest.replace(/^[\s\-–—]+/, ' ').trimStart();

  return { seconds: totalSeconds, rest };
}

function renderDescription(
  description: string,
  onSeekToTimeInSeconds?: (seconds: number) => void
) {
  if (!description) return null;
  const lines = description.split(/\r?\n/);

  return lines.map((rawLine, lineIndex) => {
    const keyPrefix = `line-${lineIndex}`;

    const parsed =
      onSeekToTimeInSeconds != null ? parseLeadingTimestamp(rawLine) : null;

    if (!parsed) {
      return (
        <div key={keyPrefix} className="mb-1 last:mb-0">
          {renderTextWithUrls(rawLine, keyPrefix)}
        </div>
      );
    }

    const { seconds, rest } = parsed;
    const timestampText = rawLine.match(/^\s*(\d{1,2}:\d{2}(?::\d{2})?)/)?.[1] ?? '';

    return (
      <div key={keyPrefix} className="mb-1 last:mb-0">
        <button
          type="button"
          className="mr-2 text-primary font-mono cursor-pointer hover:underline focus:outline-none focus:ring-1 focus:ring-primary/70 rounded-sm"
          onClick={() => {
            if (onSeekToTimeInSeconds) {
              onSeekToTimeInSeconds(seconds);
            }
          }}
          title="Перейти к этому моменту"
          aria-label={`Перейти к моменту ${timestampText || seconds + ' секунд'}`}
        >
          {timestampText}
        </button>
        {rest && renderTextWithUrls(rest, `${keyPrefix}-rest`)}
      </div>
    );
  });
}

function DescriptionActionsToolbar({ actions }: { actions: VideoDescriptionActions }) {
  const [audioBusy, setAudioBusy] = useState(false);
  const share = actions.share;
  const shareOk = share && share.baseUrl?.trim().length > 0;
  const dl = actions.download;

  const actionBtnBase =
    'h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-lg border shadow-none ' +
    'transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 ' +
    'focus-visible:ring-offset-2 focus-visible:ring-offset-background ' +
    'hover:bg-muted/70';
  const actionBtnRest =
    'border-border/60 bg-card/90 text-muted-foreground dark:bg-card/60';
  const actionBtnActive = 'border-primary/30 bg-primary/10 text-foreground';

  return (
    <div
      className={cn(
        'mt-3 border-t p-2 shadow-elevation-1',
        'dark:bg-muted/20 dark:border-border/40',
      )}
    >
      <div className="flex items-center justify-between gap-2 overflow-x-auto whitespace-nowrap">
        {actions.favorite && (
          <button
            type="button"
            disabled={actions.favorite.disabled}
            title={actions.favorite.active ? 'Убрать из избранного' : 'В избранное'}
            aria-pressed={actions.favorite.active}
            onClick={actions.favorite.onToggle}
            className={cn(
              actionBtnBase,
              actionBtnRest,
              actions.favorite.active && actionBtnActive,
            )}
          >
            <Star
              className={cn(
                'h-5 w-5 shrink-0',
                actions.favorite.active
                  ? 'fill-amber-500 text-amber-600 dark:fill-amber-400'
                  : 'text-muted-foreground',
              )}
            />
          </button>
        )}

        {actions.bookmark && (
          <button
            type="button"
            disabled={actions.bookmark.disabled}
            title={actions.bookmark.active ? 'Убрать из закреплённых' : 'Закрепить'}
            aria-pressed={actions.bookmark.active}
            onClick={actions.bookmark.onToggle}
            className={cn(
              actionBtnBase,
              actionBtnRest,
              actions.bookmark.active && actionBtnActive,
            )}
          >
            <Pin
              className={cn(
                'h-5 w-5 shrink-0',
                actions.bookmark.active
                  ? 'fill-primary/20 text-primary'
                  : 'text-muted-foreground',
              )}
            />
          </button>
        )}

        {actions.keep && (
          <button
            type="button"
            disabled={actions.keep.disabled}
            title={
              actions.keep.active
                ? 'Снять защиту от очистки'
                : 'Не удалять при очистке медиатеки'
            }
            aria-pressed={actions.keep.active}
            onClick={actions.keep.onToggle}
            className={cn(
              actionBtnBase,
              actionBtnRest,
              actions.keep.active && actionBtnActive,
            )}
          >
            <Shield
              className={cn(
                'h-5 w-5 shrink-0',
                actions.keep.active ? 'text-primary' : 'text-muted-foreground',
              )}
            />
          </button>
        )}

        {shareOk && (
          <ShareVideoMenu
            videoId={share!.videoId}
            title={share!.title}
            baseUrl={share!.baseUrl}
          >
            <button
              type="button"
              title="Поделиться"
              className={cn(actionBtnBase, actionBtnRest)}
              onClick={(e) => e.stopPropagation()}
            >
              <Share2 className="h-5 w-5 shrink-0" />
            </button>
          </ShareVideoMenu>
        )}

        {dl && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Скачать"
                className={cn(actionBtnBase, actionBtnRest)}
              >
                {audioBusy ? (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                ) : (
                  <Download className="h-5 w-5 shrink-0" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
              <DropdownMenuItem asChild>
                <a
                  href={`/api/stream/${dl.videoId}?download=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Video className="h-4 w-4 mr-2 shrink-0" />
                  Видео
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={audioBusy}
                title="AAC (.m4a). Ход подготовки — пульсация «DVStream» в шапке."
                onClick={() => {
                  if (audioBusy) return;
                  setAudioBusy(true);
                  withAudioDownloadSlot(() =>
                    fetchAndSavePreparedAudio({
                      id: dl.videoId,
                      title: dl.title,
                      platformId: dl.platformId,
                    }),
                  )
                    .catch(() => {})
                    .finally(() => setAudioBusy(false));
                }}
              >
                {audioBusy ? (
                  <Loader2 className="h-4 w-4 mr-2 shrink-0 animate-spin" />
                ) : (
                  <Music2 className="h-4 w-4 mr-2 shrink-0" />
                )}
                Аудио
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {actions.youtubeUrl && (
          <a
            href={actions.youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Открыть на YouTube"
            className={cn(actionBtnBase, actionBtnRest, 'no-underline')}
          >
            <ExternalLink className="h-5 w-5 shrink-0" />
          </a>
        )}
      </div>
    </div>
  );
}

export function VideoDescriptionDialog(props: VideoDescriptionDialogProps) {
  const { open, onOpenChange, title, description, onSeekToTimeInSeconds, actions } =
    props;
  const isMobile = useIsMobile();

  const contentClassName = [
    'max-h-[calc(100vh-3rem)]',
    'grid-rows-[auto_minmax(0,1fr)_auto]',
    isMobile ? 'w-[calc(100%-1rem)]' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const showToolbar =
    actions &&
    (actions.favorite ||
      actions.bookmark ||
      actions.keep ||
      (actions.share && actions.share.baseUrl?.trim()) ||
      actions.download ||
      actions.youtubeUrl);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={contentClassName}>
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">{title}</DialogTitle>
          {showToolbar && <DescriptionActionsToolbar actions={actions} />}
        </DialogHeader>
        <div className="mt-2 text-sm text-foreground whitespace-pre-wrap overflow-y-auto min-h-0 pr-1">
          {renderDescription(description, onSeekToTimeInSeconds)}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <HelpDocLink section="player" className="text-xs font-normal text-muted-foreground">
            Справка: видеоплеер
          </HelpDocLink>
          <DialogClose asChild>
            <Button type="button" variant="outline" size="sm">
              Закрыть
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
