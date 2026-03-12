'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { VideoCard, type VideoCardProps, type VideoCardVideo } from '@/components/video-card';

export interface SortableVideoCardProps<T extends VideoCardVideo = VideoCardVideo> extends VideoCardProps<T> {
  /** ID видео для useSortable (должен совпадать с video.id) */
  id: string;
}

export function SortableVideoCard<T extends VideoCardVideo>(props: SortableVideoCardProps<T>) {
  const { id, video, ...rest } = props;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    animateLayoutChanges: () => false, // Отключаем анимацию «возврата» при drop — UI обновляется оптимистично
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    // Применяем transition только во время перетаскивания — иначе при drop карточка анимируется «назад»
    transition: isDragging ? transition : 'none',
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <button
        type="button"
        className="absolute left-1 top-1 z-20 flex h-8 w-8 cursor-grab items-center justify-center rounded-md bg-black/40 text-white opacity-0 transition-opacity hover:opacity-100 focus:opacity-100 group-hover:opacity-100 active:cursor-grabbing"
        title="Перетащите для изменения порядка"
        onClick={(e) => e.stopPropagation()}
        {...listeners}
        {...attributes}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <VideoCard video={video} {...rest} />
    </div>
  );
}
