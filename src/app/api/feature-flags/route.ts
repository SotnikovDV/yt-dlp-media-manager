import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

/** Публичные флаги UI (без секретов). */
export async function GET() {
  return NextResponse.json({
    smartSearchAvailable: env.smartSearchAvailable(),
  });
}
