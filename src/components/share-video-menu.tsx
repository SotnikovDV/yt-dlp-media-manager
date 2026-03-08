'use client';

import React from 'react';
import { Share2, MessageCircle, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ShareVideoMenuProps {
  videoId: string;
  title: string;
  baseUrl: string;
  /** Кнопка-триггер. По умолчанию — иконка Share2 */
  children?: React.ReactNode;
  /** Дополнительные классы для кнопки по умолчанию */
  triggerClassName?: string;
  /** Размер кнопки по умолчанию: 'sm' | 'icon' */
  triggerSize?: 'sm' | 'default' | 'icon' | 'lg';
  variant?: 'ghost' | 'secondary' | 'default';
}

function buildWatchUrl(baseUrl: string, videoId: string): string {
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/watch/${videoId}`;
}

function openTelegramShare(url: string, text: string): void {
  const u = new URL('https://t.me/share/url');
  u.searchParams.set('url', url);
  u.searchParams.set('text', text);
  window.open(u.toString(), '_blank', 'noopener,noreferrer');
}

function copyLink(url: string): Promise<void> {
  return navigator.clipboard.writeText(url);
}

export function ShareVideoMenu({
  videoId,
  title,
  baseUrl,
  children,
  triggerClassName,
  triggerSize = 'sm',
  variant = 'ghost',
}: ShareVideoMenuProps) {
  const watchUrl = buildWatchUrl(baseUrl, videoId);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    copyLink(watchUrl).then(
      () => toast.success('Ссылка скопирована'),
      () => toast.error('Не удалось скопировать')
    );
  };

  const handleTelegram = (e: React.MouseEvent) => {
    e.stopPropagation();
    openTelegramShare(watchUrl, title);
  };

  const trigger =
    children ?? (
      <Button
        size={triggerSize}
        variant={variant}
        className={cn('shrink-0', triggerClassName)}
        title="Поделиться"
        onClick={(e) => e.stopPropagation()}
      >
        <Share2 className="h-3 w-3" />
      </Button>
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onPointerDown={(e) => e.stopPropagation()}>
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={handleTelegram}>
          <MessageCircle className="h-4 w-4" />
          В Telegram
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCopy}>
          <Link2 className="h-4 w-4" />
          Скопировать ссылку
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
