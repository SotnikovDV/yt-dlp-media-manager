import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * POST /api/restart — завершает процесс. При запуске через PM2, Docker или systemd
 * приложение автоматически перезапустится.
 */
export async function POST() {
  // Отправляем ответ до выхода
  const res = NextResponse.json({ success: true });
  // Даём время на отправку ответа, затем выходим
  setTimeout(() => process.exit(0), 500);
  return res;
}
