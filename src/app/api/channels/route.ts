import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

// GET /api/channels - получить список каналов
export async function GET() {
  try {
    const channels = await db.channel.findMany({
      include: {
        _count: {
          select: { videos: true, subscriptions: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    return NextResponse.json(channels);
  } catch (error: any) {
    console.error('Error fetching channels:', error);
    const msg = process.env.NODE_ENV === 'development' ? error?.message : 'Failed to fetch channels';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
