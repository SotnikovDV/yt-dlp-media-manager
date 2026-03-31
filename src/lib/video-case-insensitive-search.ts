/**
 * Подстрочный поиск без учёта регистра для SQLite.
 * Prisma `contains` регистрозависим; SQL `LOWER()` в SQLite ниже 3.47 почти только для ASCII,
 * поэтому кириллица не совпадала. Сравниваем строки в JS через Unicode (toLocaleLowerCase).
 */

import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

function fold(s: string): string {
  return s.toLocaleLowerCase('und');
}

/**
 * Варианты подстрок для OR-поиска: весь запрос + содержимое круглых скобок отдельно.
 * «(NotebookLM)» само по себе не входит в заголовок «NotebookLM» без скобок.
 */
export function expandQueryNeedlesForCaseInsensitiveSearch(q: string): string[] {
  const t = q.trim();
  if (!t) return [];
  const seen = new Set<string>();
  const order: string[] = [];
  const add = (s: string, minLen: number) => {
    const x = s.trim();
    if (x.length < minLen) return;
    const k = fold(x);
    if (seen.has(k)) return;
    seen.add(k);
    order.push(x);
  };
  add(t, 1);
  for (const m of t.matchAll(/\(([^)]+)\)/g)) {
    add(m[1], 2);
  }
  return order;
}

function channelScopeSql(
  channelId: Prisma.VideoWhereInput['channelId']
): { sql: Prisma.Sql; impossible: boolean } {
  if (channelId === undefined) {
    return { sql: Prisma.sql`TRUE`, impossible: false };
  }
  if (typeof channelId === 'string') {
    return { sql: Prisma.sql`v."channelId" = ${channelId}`, impossible: false };
  }
  if (
    typeof channelId === 'object' &&
    channelId !== null &&
    'in' in channelId &&
    Array.isArray((channelId as { in: string[] }).in)
  ) {
    const arr = (channelId as { in: string[] }).in;
    if (arr.length === 0) {
      return { sql: Prisma.sql`FALSE`, impossible: true };
    }
    return { sql: Prisma.sql`v."channelId" IN (${Prisma.join(arr)})`, impossible: false };
  }
  return { sql: Prisma.sql`TRUE`, impossible: false };
}

function userIndividualSql(
  uv: Prisma.VideoWhereInput['userIndividualVideos']
): Prisma.Sql {
  const some =
    uv && typeof uv === 'object' && 'some' in uv
      ? (uv as { some?: { userId?: string } }).some
      : undefined;
  const uid = typeof some?.userId === 'string' ? some.userId : undefined;
  if (uid === undefined) {
    return Prisma.sql`TRUE`;
  }
  return Prisma.sql`EXISTS (SELECT 1 FROM "UserIndividualVideo" uiv WHERE uiv."videoId" = v.id AND uiv."userId" = ${uid})`;
}

export type CaseInsensitiveVideoTextParams = {
  needles: string[];
  channelId: Prisma.VideoWhereInput['channelId'];
  userIndividualVideos?: Prisma.VideoWhereInput['userIndividualVideos'];
  tagId?: string;
  quality?: string;
  /** title + description + имя канала (этап 2 AI); иначе только title + description (классика в API). */
  includeChannelName: boolean;
};

type RowClassic = { id: string; title: string; d: string };
type RowChannel = RowClassic & { cn: string };

/**
 * Id видео в scope, у которых любая из подстрок needles (ИЛИ) встречается в выбранных полях, без учёта регистра (Unicode).
 */
export async function findVideoIdsCaseInsensitiveText(
  prisma: PrismaClient,
  p: CaseInsensitiveVideoTextParams
): Promise<string[]> {
  const needles = [...new Set(p.needles.map((n) => n.trim()).filter(Boolean))];
  if (needles.length === 0) return [];

  const foldedNeedles = needles.map(fold);

  const { sql: chSql, impossible } = channelScopeSql(p.channelId);
  if (impossible) return [];

  const indSql = userIndividualSql(p.userIndividualVideos);
  const tagSql = p.tagId
    ? Prisma.sql`EXISTS (SELECT 1 FROM "VideoTag" vt WHERE vt."videoId" = v.id AND vt."tagId" = ${p.tagId})`
    : Prisma.sql`TRUE`;
  const qualSql = p.quality
    ? Prisma.sql`v.quality = ${p.quality}`
    : Prisma.sql`TRUE`;

  if (p.includeChannelName) {
    const rows = await prisma.$queryRaw<RowChannel[]>`
      SELECT v.id, v.title, COALESCE(v.description, '') AS d, c.name AS cn
      FROM "Video" v
      INNER JOIN "Channel" c ON c.id = v."channelId"
      WHERE v."filePath" IS NOT NULL
      AND ${chSql}
      AND ${indSql}
      AND ${tagSql}
      AND ${qualSql}
    `;
    const out: string[] = [];
    for (const row of rows) {
      const t = fold(row.title);
      const d = fold(row.d);
      const cn = fold(row.cn);
      const hit = foldedNeedles.some((n) => t.includes(n) || d.includes(n) || cn.includes(n));
      if (hit) out.push(row.id);
    }
    return out;
  }

  const rows = await prisma.$queryRaw<RowClassic[]>`
    SELECT v.id, v.title, COALESCE(v.description, '') AS d
    FROM "Video" v
    WHERE v."filePath" IS NOT NULL
    AND ${chSql}
    AND ${indSql}
    AND ${tagSql}
    AND ${qualSql}
  `;
  const out: string[] = [];
  for (const row of rows) {
    const t = fold(row.title);
    const d = fold(row.d);
    const hit = foldedNeedles.some((n) => t.includes(n) || d.includes(n));
    if (hit) out.push(row.id);
  }
  return out;
}
