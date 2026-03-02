import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getChannelInfo } from '@/lib/ytdlp';
import { downloadAndSaveChannelAvatar } from '@/lib/avatars';
import { getDownloadPathAsync } from '@/lib/settings';

export const runtime = 'nodejs';

// POST /api/import - импорт подписок и настроек (подписки создаются для текущего пользователя)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { subscriptions } = body;

    const results = {
      subscriptions: { imported: 0, failed: 0 },
      settings: { skipped: true, note: 'Настройки задаются в .env.local' }
    };

    // Импортируем подписки для текущего пользователя
    if (Array.isArray(subscriptions)) {
      for (const sub of subscriptions) {
        try {
          // Получаем информацию о канале
          const channelInfo = await getChannelInfo(sub.channelUrl);

          // Создаём или находим канал
          const channel = await db.channel.upsert({
            where: { platformId: channelInfo.id },
            create: {
              platform: 'youtube',
              platformId: channelInfo.id,
              name: channelInfo.name,
              description: channelInfo.description,
              avatarUrl: channelInfo.avatar
            },
            update: {
              name: channelInfo.name,
              description: channelInfo.description,
              avatarUrl: channelInfo.avatar
            }
          });

          if (channelInfo.avatar) {
            const avatarPath = await downloadAndSaveChannelAvatar(
              channelInfo.avatar,
              channelInfo.id,
              getDownloadPathAsync
            );
            if (avatarPath) {
              await db.channel.update({
                where: { id: channel.id },
                data: { avatarPath }
              });
            }
          }

          // Проверяем существующую подписку у этого пользователя
          const existing = await db.subscription.findFirst({
            where: { channelId: channel.id, userId: session.user.id }
          });

          if (!existing) {
            await db.subscription.create({
              data: {
                userId: session.user.id,
                channelId: channel.id,
                downloadDays: sub.downloadDays || 30,
                preferredQuality: sub.preferredQuality || 'best',
                outputFolder: sub.outputFolder,
                checkInterval: sub.checkInterval || 360,
                isActive: true
              }
            });
            results.subscriptions.imported++;
          }
        } catch (e) {
          console.error('Error importing subscription:', e);
          results.subscriptions.failed++;
        }
      }
    }

    // Настройки не импортируем — они задаются в .env.local

    return NextResponse.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('Error importing data:', error);
    return NextResponse.json({ error: 'Failed to import data' }, { status: 500 });
  }
}
