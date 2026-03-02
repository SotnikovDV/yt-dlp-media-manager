import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { VideoPlayer } from '@/components/video-player';

export const runtime = 'nodejs';

export default async function WatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-5xl aspect-video bg-black">
        <VideoPlayer
          src={`/api/stream/${resolved.id}`}
          title={resolved.title}
          channelName={resolved.channel?.name ?? undefined}
          publishedAt={resolved.publishedAt ?? undefined}
        />
      </div>
    </div>
  );
}
