/**
 * Модель очередей воспроизведения: предопределённые и пользовательские.
 * Контекст = источник очереди + снимок списка + текущий индекс (вариант A).
 */

/** Предопределённые очереди: источник и порядок заданы бэкендом/секциями. */
export type PlaybackQueuePredefined =
  | { kind: 'recentPublished' }
  | { kind: 'recentDownloaded' }
  | { kind: 'recentWatched' }
  | { kind: 'favorites' }
  | { kind: 'bookmarks' }
  | { kind: 'subscriptionCategory'; categoryId: string | null }
  | { kind: 'channel'; channelId: string }
  | { kind: 'library' } // пагинированный список медиатеки (поиск или все подписки)
  | { kind: 'individualVideos' } // секция «Отдельные видео»
  | { kind: 'queue' }; // очередь загрузок (завершённые с видео)

/** Пользовательская очередь (плейлист в БД). */
export type PlaybackQueueCustom = { kind: 'custom'; playlistId: string };

export type PlaybackQueueSource = PlaybackQueuePredefined | PlaybackQueueCustom;

/** Элемент очереди — минимум для навигации; полные данные в items. */
export interface PlaybackQueueItem {
  id: string;
}

/**
 * Контекст воспроизведения: текущая очередь (снимок списка) и индекс.
 * Вариант A: список хранится на клиенте, prev/next = index ± 1.
 */
export interface PlaybackQueueContext<T extends PlaybackQueueItem = PlaybackQueueItem> {
  source: PlaybackQueueSource;
  items: T[];
  index: number;
}

export function hasPrevQueue<T extends PlaybackQueueItem>(ctx: PlaybackQueueContext<T> | null): boolean {
  return ctx != null && ctx.index > 0 && ctx.items.length > 0;
}

export function hasNextQueue<T extends PlaybackQueueItem>(ctx: PlaybackQueueContext<T> | null): boolean {
  return ctx != null && ctx.items.length > 0 && ctx.index < ctx.items.length - 1;
}

export function getPrevInQueue<T extends PlaybackQueueItem>(ctx: PlaybackQueueContext<T> | null): T | null {
  if (!hasPrevQueue(ctx)) return null;
  return ctx!.items[ctx!.index - 1] ?? null;
}

export function getNextInQueue<T extends PlaybackQueueItem>(ctx: PlaybackQueueContext<T> | null): T | null {
  if (!hasNextQueue(ctx)) return null;
  return ctx!.items[ctx!.index + 1] ?? null;
}
