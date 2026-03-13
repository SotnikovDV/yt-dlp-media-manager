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
}

const urlRegex = /(https?:\/\/[^\s]+)/g;

function renderDescriptionWithLinks(text: string) {
  if (!text) return null;
  const parts = text.split(urlRegex);
  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={`url-${index}`}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 break-all"
        >
          {part}
        </a>
      );
    }
    return <React.Fragment key={`text-${index}`}>{part}</React.Fragment>;
  });
}

export function VideoDescriptionDialog(props: VideoDescriptionDialogProps) {
  const { open, onOpenChange, title, description, youtubeUrl } = props;
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
        <DialogDescription
          className="mt-2 text-sm text-foreground whitespace-pre-wrap overflow-y-auto min-h-0 pr-1"
        >
          {renderDescriptionWithLinks(description)}
        </DialogDescription>
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

