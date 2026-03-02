import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * GET /api/health — проверка работоспособности (БД, env)
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; error?: string }> = {};

  try {
    await db.$queryRaw`SELECT 1`;
    checks.db = { ok: true };
  } catch (e: any) {
    checks.db = { ok: false, error: e?.message || String(e) };
  }

  checks.env = {
    ok: !!process.env.DATABASE_URL,
    error: !process.env.DATABASE_URL ? 'DATABASE_URL not set' : undefined,
  };

  const allOk = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    { ok: allOk, checks },
    { status: allOk ? 200 : 503 }
  );
}
