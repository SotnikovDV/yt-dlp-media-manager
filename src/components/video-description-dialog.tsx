'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';

export interface VideoDescriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  youtubeUrl?: string | null;
  /** Колбэк для перемотки текущего плеера к указанному времени (в секундах). */
  onSeekToTimeInSeconds?: (seconds: number) => void;
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
  // Поддерживаем: 00:00, 0:00, 00:00:05; возможны пробелы в начале строки.
  const match = line.match(/^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?(.*)$/);
  if (!match) return null;
  const [, hStr, mStr, sStr, tail] = match;
  // Если три части (H:MM:SS) — первая = часы; если две (MM:SS) — первая = минуты
  const hours = sStr != null ? Number(hStr) || 0 : 0;
  const minutes = sStr != null ? Number(mStr) || 0 : Number(hStr) || 0;
  const seconds = sStr != null ? Number(sStr) || 0 : Number(mStr) || 0;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return null;

  // Убираем типичные разделители после таймкода: -, —, – и лишние пробелы
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

export function VideoDescriptionDialog(props: VideoDescriptionDialogProps) {
  const { open, onOpenChange, title, description, youtubeUrl, onSeekToTimeInSeconds } = props;
  const isMobile = useIsMobile();

  const contentClassName = [
    'max-h-[calc(100vh-3rem)]',
    'grid-rows-[auto_minmax(0,1fr)_auto]',
    isMobile ? 'w-[calc(100%-1rem)]' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={contentClassName}
      >
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">{title}</DialogTitle>
          {youtubeUrl && (
            <div className="mt-1">
              <a
                href={youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                Открыть на YouTube
              </a>
            </div>
          )}
        </DialogHeader>
        {/* Вместо DialogDescription используем div, чтобы избежать вложения блоков внутрь <p>. */}
        <div className="mt-2 text-sm text-foreground whitespace-pre-wrap overflow-y-auto min-h-0 pr-1">
          {renderDescription(description, onSeekToTimeInSeconds)}
        </div>
        <div className="mt-4 flex justify-end">
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

