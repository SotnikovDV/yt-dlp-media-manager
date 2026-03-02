import { NextResponse } from 'next/server';
import { checkDependencies } from '@/lib/deps';

export const runtime = 'nodejs';

// GET /api/deps - статус внешних зависимостей (yt-dlp, ffmpeg)
export async function GET() {
  const deps = await checkDependencies();
  return NextResponse.json(deps);
}

