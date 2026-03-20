import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { env, tryParseAudioExtractAacBitrate } from '@/lib/env';
import { readEnvSettings, writeEnvSettings } from '@/lib/env-file';

export const runtime = 'nodejs';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((session.user as any).isAdmin !== true) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

function parseEnvMono(v: string): boolean {
  const raw = v.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

/**
 * GET /api/settings — настройки из .env.local (только для администраторов).
 */
export async function GET() {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const fromFile = await readEnvSettings();
    return NextResponse.json({
      downloadPath: fromFile.DOWNLOAD_PATH ?? env.downloadPath(),
      defaultQuality: fromFile.DEFAULT_QUALITY ?? env.defaultQuality(),
      defaultFormat: fromFile.DEFAULT_FORMAT ?? env.defaultFormat(),
      defaultSubscriptionHistoryDays: fromFile.DEFAULT_SUBSCRIPTION_HISTORY_DAYS
        ? parseInt(fromFile.DEFAULT_SUBSCRIPTION_HISTORY_DAYS, 10)
        : env.defaultSubscriptionHistoryDays(),
      defaultSubscriptionAutoDeleteDays: fromFile.DEFAULT_SUBSCRIPTION_AUTO_DELETE_DAYS
        ? parseInt(fromFile.DEFAULT_SUBSCRIPTION_AUTO_DELETE_DAYS, 10)
        : env.defaultSubscriptionAutoDeleteDays(),
      defaultCheckInterval: fromFile.DEFAULT_CHECK_INTERVAL
        ? parseInt(fromFile.DEFAULT_CHECK_INTERVAL, 10)
        : env.defaultCheckInterval(),
      defaultPlayerMode: fromFile.DEFAULT_PLAYER_MODE ?? env.defaultPlayerMode(),
      autoplayOnOpen:
        typeof fromFile.AUTOPLAY_ON_OPEN !== 'undefined'
          ? parseInt(fromFile.AUTOPLAY_ON_OPEN, 10) !== 0
          : env.autoplayOnOpen(),
      telegramBotToken: fromFile.TELEGRAM_BOT_TOKEN ?? env.telegramBotToken(),
      telegramAdminChatId: fromFile.TELEGRAM_ADMIN_CHAT_ID ?? env.telegramAdminChatId(),
      audioExtractAacBitrate:
        typeof fromFile.AUDIO_EXTRACT_AAC_BITRATE === 'string'
          ? tryParseAudioExtractAacBitrate(fromFile.AUDIO_EXTRACT_AAC_BITRATE) ?? '96k'
          : env.audioExtractAacBitrate(),
      audioExtractAacMono:
        typeof fromFile.AUDIO_EXTRACT_AAC_MONO === 'string'
          ? parseEnvMono(fromFile.AUDIO_EXTRACT_AAC_MONO)
          : env.audioExtractAacMono(),
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

/**
 * PUT /api/settings — сохранить настройки в .env.local (только для администраторов).
 */
export async function PUT(request: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const body = await request.json();
    const updates: Record<string, string> = {};

    if (typeof body.downloadPath === 'string') updates.DOWNLOAD_PATH = body.downloadPath;
    if (typeof body.defaultQuality === 'string') updates.DEFAULT_QUALITY = body.defaultQuality;
    if (typeof body.defaultFormat === 'string') updates.DEFAULT_FORMAT = body.defaultFormat;
    if (typeof body.defaultSubscriptionHistoryDays !== 'undefined') {
      updates.DEFAULT_SUBSCRIPTION_HISTORY_DAYS = String(body.defaultSubscriptionHistoryDays);
    }
    if (typeof body.defaultSubscriptionAutoDeleteDays !== 'undefined') {
      updates.DEFAULT_SUBSCRIPTION_AUTO_DELETE_DAYS = String(body.defaultSubscriptionAutoDeleteDays);
    }
    if (typeof body.defaultCheckInterval !== 'undefined') {
      updates.DEFAULT_CHECK_INTERVAL = String(body.defaultCheckInterval);
    }
    if (typeof body.defaultPlayerMode === 'string') {
      const v = String(body.defaultPlayerMode).toLowerCase().trim();
      if (v === 'normal' || v === 'fullscreen' || v === 'mini') {
        updates.DEFAULT_PLAYER_MODE = v;
      }
    }
    if (typeof body.autoplayOnOpen !== 'undefined') {
      const b =
        body.autoplayOnOpen === true ||
        body.autoplayOnOpen === 1 ||
        body.autoplayOnOpen === '1';
      updates.AUTOPLAY_ON_OPEN = b ? '1' : '0';
    }
    if (typeof body.telegramBotToken === 'string') {
      updates.TELEGRAM_BOT_TOKEN = body.telegramBotToken;
    }
    if (typeof body.telegramAdminChatId === 'string') {
      updates.TELEGRAM_ADMIN_CHAT_ID = body.telegramAdminChatId;
    }
    if (typeof body.audioExtractAacBitrate === 'string') {
      const parsed = tryParseAudioExtractAacBitrate(body.audioExtractAacBitrate);
      if (parsed === null) {
        return NextResponse.json(
          { error: 'Некорректный битрейт AAC (например 96k, 128k или 96)' },
          { status: 400 }
        );
      }
      updates.AUDIO_EXTRACT_AAC_BITRATE = parsed;
    }
    if (typeof body.audioExtractAacMono !== 'undefined') {
      const raw = body.audioExtractAacMono;
      const b =
        raw === true ||
        raw === 1 ||
        raw === '1' ||
        raw === 'true' ||
        raw === 'yes' ||
        raw === 'on';
      updates.AUDIO_EXTRACT_AAC_MONO = b ? '1' : '0';
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: true });
    }

    await writeEnvSettings(updates);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving settings:', error);
    return NextResponse.json(
      { error: 'Не удалось сохранить настройки. Проверьте права доступа к .env.local' },
      { status: 500 }
    );
  }
}
