'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { VideoCard } from '@/components/video-card';
import type { Video as VideoType } from '@prisma/client';

type PublicPlaylistResponse = {
  id: string;
  name: string;
  createdAt: string;
  owner?: {
    id: string;
    name: string | null;
  } | null;
  videos: VideoType[];
};

export default function SharedPlaylistPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const { data: session } = useSession();
  const router = useRouter();
  const [data, setData] = useState<PublicPlaylistResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch(`/api/playlists/public/${encodeURIComponent(token)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const message = body?.error || 'Плейлист недоступен';
          if (!cancelled) {
            setError(message);
          }
          return;
        }
        const json = (await res.json()) as PublicPlaylistResponse;
        if (!cancelled) {
          setData(json);
        }
      } catch {
        if (!cancelled) {
          setError('Не удалось загрузить плейлист');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleCopy = async () => {
    try {
      setCopying(true);
      const res = await fetch('/api/playlists/copy-by-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Не удалось скопировать плейлист');
      }
      toast.success('Плейлист скопирован в вашу медиатеку');
      router.push('/library');
    } catch (e: any) {
      toast.error(e?.message || 'Не удалось скопировать плейлист');
    } finally {
      setCopying(false);
    }
  };

  const handlePlay = (video: VideoType) => {
    if (typeof window === 'undefined') return;
    const url = `/api/stream/${video.id}`;
    window.open(url, '_blank');
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-40" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="aspect-video w-full" />
                <div className="p-3 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : error ? (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">{error}</p>
        </Card>
      ) : !data ? (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Плейлист недоступен.</p>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold mb-1">{data.name}</h1>
              {data.owner?.name && (
                <p className="text-sm text-muted-foreground">
                  Автор: <span className="font-medium">{data.owner.name}</span>
                </p>
              )}
              <p className="text-sm text-muted-foreground mt-1">
                Видео в плейлисте: {data.videos.length}
              </p>
            </div>
            {session?.user && (
              <Button onClick={handleCopy} disabled={copying}>
                {copying ? 'Копирование...' : 'Скопировать плейлист себе'}
              </Button>
            )}
          </div>
          {data.videos.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {data.videos.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video as any}
                  onPlay={handlePlay as any}
                  showFavoriteButton={false}
                  shareBaseUrl={typeof window !== 'undefined' ? window.location.origin : ''}
                />
              ))}
            </div>
          ) : (
            <Card className="p-6">
              <p className="text-sm text-muted-foreground">В этом плейлисте пока нет видео.</p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

