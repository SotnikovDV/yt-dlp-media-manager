import { db } from '@/lib/db';

/**
 * Приводит список имён тегов к уникальному массиву непустых строк (trim, ограничение длины).
 */
const MAX_TAG_LENGTH = 100;

function normalizeTagNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const name = typeof n === 'string' ? n.trim().toLowerCase().slice(0, MAX_TAG_LENGTH) : '';
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/**
 * Синхронизирует теги видео с переданным списком имён: создаёт Tag при отсутствии,
 * привязывает/отвязывает VideoTag так, чтобы у видео был ровно этот набор тегов.
 */
export async function syncVideoTagsFromNames(
  videoId: string,
  tagNames: string[]
): Promise<{ added: number; removed: number }> {
  const names = normalizeTagNames(tagNames);
  const currentLinks = await db.videoTag.findMany({
    where: { videoId },
    include: { tag: true },
  });
  const currentByName = new Map(currentLinks.map((l) => [l.tag.name, l]));

  const toAdd = names.filter((name) => !currentByName.has(name));
  const toRemove = currentLinks.filter((l) => !names.includes(l.tag.name));

  for (const name of toAdd) {
    const tag = await db.tag.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    await db.videoTag.create({
      data: { videoId, tagId: tag.id },
    });
  }

  if (toRemove.length > 0) {
    await db.videoTag.deleteMany({
      where: {
        videoId,
        tagId: { in: toRemove.map((l) => l.tagId) },
      },
    });
  }

  return { added: toAdd.length, removed: toRemove.length };
}
