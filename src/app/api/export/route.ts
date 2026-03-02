import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

// GET /api/export - экспорт подписок и настроек
export async function GET() {
  try {
    const subscriptions = await db.subscription.findMany({
      include: { channel: true }
    });

    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      subscriptions: subscriptions.map(s => ({
        channelUrl: `https://www.youtube.com/channel/${s.channel.platformId}`,
        channelName: s.channel.name,
        downloadDays: s.downloadDays,
        preferredQuality: s.preferredQuality,
        outputFolder: s.outputFolder,
        checkInterval: s.checkInterval
      })),
      settings: {
        downloadPath: env.downloadPath(),
        defaultQuality: env.defaultQuality(),
        defaultFormat: env.defaultFormat(),
        defaultSubscriptionHistoryDays: env.defaultSubscriptionHistoryDays(),
        defaultCheckInterval: env.defaultCheckInterval(),
        _note: 'Настройки задаются в .env.local'
      }
    };

    return NextResponse.json(exportData);
  } catch (error) {
    console.error('Error exporting data:', error);
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 });
  }
}
