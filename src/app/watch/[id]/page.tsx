import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { VideoPlayer } from '@/components/video-player';
import { env } from '@/lib/env';
import { getChaptersForVideo } from '@/lib/read-info-chapters';
import { getDownloadPathAsync } from '@/lib/settings';

export const runtime = 'nodejs';

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const { id } = params;

  const baseUrl = env.baseUrl();
  const url = `${baseUrl}/watch/${id}`;
  const imageUrl = `${baseUrl}/api/thumbnail/${id}`;
  const title = 'Видео';
  const description = 'Видео из вашего личного медиа-архива';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: 'video.other',
      siteName: 'Видеоархив',
      images: [
        {
          url: imageUrl,
          width: 1280,
          height: 720,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function WatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const video = await db.video.findUnique({
      where: { id },
      include: { channel: true },
    });
    const resolved =
      video ??
      (await db.video.findFirst({
        where: { platformId: id },
        include: { channel: true },
      }));

    if (!resolved || !resolved.filePath) {
      notFound();
    }

    const chapters = await getChaptersForVideo(
      { filePath: resolved.filePath, platformId: resolved.platformId },
      getDownloadPathAsync
    );

    const baseUrl = env.baseUrl();

    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-5xl aspect-video bg-black py-8 relative">
          <VideoPlayer
            src={`/api/stream/${resolved.id}`}
            title={resolved.title}
            baseUrl={baseUrl}
            channelName={resolved.channel?.name ?? undefined}
            channelId={resolved.channel?.id ?? undefined}
            publishedAt={resolved.publishedAt ?? undefined}
            chapters={chapters.length > 0 ? chapters : undefined}
          />
        </div>
      </div>
    );
  } catch (error) {
    console.error('WatchPage error:', error);
    notFound();
  }
}
