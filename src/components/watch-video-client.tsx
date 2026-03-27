'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  VideoPlayer,
  type VideoPlayerDescriptionActions,
  type VideoPlayerPlaylistMenu,
} from '@/components/video-player';
import type { PlaylistForCard } from '@/components/video-card';
import type { VideoChapter } from '@/lib/read-info-chapters';
import { toast } from 'sonner';

type VideoApi = {
  id: string;
  title: string;
  description?: string | null;
  platformId: string;
  format?: string | null;
  filePath?: string | null;
  publishedAt?: string | null;
  channel?: { id: string; name: string } | null;
  favorites?: { id: string }[];
  bookmarks?: { id: string }[];
  pins?: { id: string }[];
};

export function WatchVideoClient(props: {
  videoId: string;
  baseUrl: string;
  streamSrc: string;
  title: string;
  channelName?: string;
  channelId?: string;
  publishedAt?: Date | string | null;
  format?: string | null;
  chapters?: VideoChapter[];
  poster?: string;
  /** Из ссылки Telegram (?fs=1): открыть плеер в полноэкранном режиме */
  initialFullscreen?: boolean;
}) {
  const {
    videoId,
    baseUrl,
    streamSrc,
    title,
    channelName,
    channelId,
    publishedAt,
    format,
    chapters,
    poster,
    initialFullscreen = false,
  } = props;

  const router = useRouter();
  const { data: session, status, update } = useSession();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<'fav' | 'bm' | 'pin' | null>(null);

  useEffect(() => {
    void update();
  }, [update]);

  const { data: videoApi } = useQuery({
    queryKey: ['watch-video', videoId, session?.user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/videos/${encodeURIComponent(videoId)}`);
      if (!res.ok) throw new Error('Failed to load video');
      return (await res.json()) as VideoApi;
    },
    enabled: status === 'authenticated' && Boolean(session?.user?.id),
  });

  const { data: playlistsPayload } = useQuery({
    queryKey: ['playlists'],
    queryFn: async () => {
      const res = await fetch('/api/playlists');
      if (!res.ok) throw new Error('playlists');
      return res.json() as Promise<{ playlists: PlaylistForCard[] }>;
    },
    enabled: status === 'authenticated' && Boolean(session?.user?.id),
  });

  const v = videoApi;

  const patchFavorite = useCallback(async (next: boolean) => {
    setPending('fav');
    try {
      await fetch(`/api/videos/${encodeURIComponent(videoId)}/favorite`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite: next }),
      });
      await queryClient.invalidateQueries({ queryKey: ['watch-video', videoId] });
    } finally {
      setPending(null);
    }
  }, [queryClient, videoId]);

  const patchBookmark = useCallback(async (next: boolean) => {
    setPending('bm');
    try {
      await fetch(`/api/videos/${encodeURIComponent(videoId)}/bookmark`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isBookmarked: next }),
      });
      await queryClient.invalidateQueries({ queryKey: ['watch-video', videoId] });
    } finally {
      setPending(null);
    }
  }, [queryClient, videoId]);

  const patchPin = useCallback(async (next: boolean) => {
    setPending('pin');
    try {
      await fetch(`/api/videos/${encodeURIComponent(videoId)}/pin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: next }),
      });
      await queryClient.invalidateQueries({ queryKey: ['watch-video', videoId] });
    } finally {
      setPending(null);
    }
  }, [queryClient, videoId]);

  const handleAddToPlaylist = useCallback(
    async (playlistId: string, vid: string) => {
      const pl = playlistsPayload?.playlists.find((p) => p.id === playlistId);
      if (!pl) return;
      const res = await fetch(`/api/playlists/${encodeURIComponent(playlistId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoIds: [...pl.videoIds, vid] }),
      });
      if (!res.ok) {
        toast.error('Не удалось добавить в плейлист');
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['playlists'] });
      toast.success(`Добавлено в «${pl.name}»`);
    },
    [playlistsPayload?.playlists, queryClient],
  );

  const handleRemoveFromPlaylist = useCallback(
    async (playlistId: string, vid: string) => {
      const pl = playlistsPayload?.playlists.find((p) => p.id === playlistId);
      if (!pl) return;
      const res = await fetch(`/api/playlists/${encodeURIComponent(playlistId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoIds: pl.videoIds.filter((id) => id !== vid) }),
      });
      if (!res.ok) {
        toast.error('Не удалось удалить из плейлиста');
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['playlists'] });
      toast.success(`Удалено из «${pl.name}»`);
    },
    [playlistsPayload?.playlists, queryClient],
  );

  const handleCreatePlaylistAndAdd = useCallback(
    async (vid: string, name?: string) => {
      const res = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name?.trim() || 'Новый плейлист',
          videoIds: [vid],
        }),
      });
      if (!res.ok) {
        toast.error('Не удалось создать плейлист');
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['playlists'] });
      toast.success('Плейлист создан, видео добавлено');
    },
    [queryClient],
  );

  const descriptionActions: VideoPlayerDescriptionActions | undefined = useMemo(() => {
    if (!session?.user || !v) return undefined;
    const root = baseUrl.replace(/\/$/, '');
    const share = { videoId: v.id, title: v.title, baseUrl: root };
    const download =
      v.filePath != null
        ? { videoId: v.id, title: v.title, platformId: v.platformId }
        : undefined;
    return {
      favorite: {
        active: (v.favorites?.length ?? 0) > 0,
        disabled: pending === 'fav',
        onToggle: () => void patchFavorite(!((v.favorites?.length ?? 0) > 0)),
      },
      bookmark: {
        active: (v.bookmarks?.length ?? 0) > 0,
        disabled: pending === 'bm',
        onToggle: () => void patchBookmark(!((v.bookmarks?.length ?? 0) > 0)),
      },
      keep: {
        active: (v.pins?.length ?? 0) > 0,
        disabled: pending === 'pin',
        onToggle: () => void patchPin(!((v.pins?.length ?? 0) > 0)),
      },
      share,
      ...(download ? { download } : {}),
    };
  }, [session?.user, v, baseUrl, pending, patchFavorite, patchBookmark, patchPin]);

  const playlistMenu: VideoPlayerPlaylistMenu | undefined = useMemo(() => {
    if (!session?.user || status !== 'authenticated') return undefined;
    return {
      playlists: playlistsPayload?.playlists ?? [],
      videoId,
      onAddToPlaylist: handleAddToPlaylist,
      onRemoveFromPlaylist: handleRemoveFromPlaylist,
      onCreatePlaylistAndAdd: handleCreatePlaylistAndAdd,
    };
  }, [
    session?.user,
    status,
    playlistsPayload?.playlists,
    videoId,
    handleAddToPlaylist,
    handleRemoveFromPlaylist,
    handleCreatePlaylistAndAdd,
  ]);

  const youtubeUrl = v?.platformId
    ? `https://www.youtube.com/watch?v=${v.platformId}`
    : null;

  const displayTitle = v?.title ?? title;
  const displayChannel = v?.channel?.name ?? channelName;
  const displayChannelId = v?.channel?.id ?? channelId;
  const displayPublished = v?.publishedAt ?? publishedAt ?? undefined;
  const displayFormat = v?.format ?? format ?? undefined;
  const description = v?.description ?? undefined;

  const brandHomeLink =
    session?.user && status === 'authenticated'
      ? {
          label: 'DVStream',
          href: `${baseUrl.replace(/\/$/, '')}/library?openVideo=${encodeURIComponent(videoId)}`,
        }
      : undefined;

  const onClosePlayer = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/library');
    }
  }, [router]);

  return (
    <VideoPlayer
      src={streamSrc}
      title={displayTitle}
      baseUrl={baseUrl}
      format={displayFormat}
      channelName={displayChannel}
      channelId={displayChannelId}
      publishedAt={displayPublished}
      poster={poster}
      chapters={chapters && chapters.length > 0 ? chapters : undefined}
      description={description}
      youtubeUrl={youtubeUrl}
      descriptionActions={descriptionActions}
      brandHomeLink={brandHomeLink}
      initialFullscreen={initialFullscreen}
      playlistMenu={playlistMenu}
      windowedToolbarOnlyClose
      onClosePlayer={session?.user ? onClosePlayer : undefined}
      onPositionSave={
        session?.user
          ? (position, completed) => {
              void fetch(`/api/videos/${encodeURIComponent(videoId)}/watch`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ position, completed }),
              }).catch(() => {});
            }
          : undefined
      }
    />
  );
}
