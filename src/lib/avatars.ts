import fs from 'fs/promises';
import path from 'path';
import { toRelativeFilePath } from './path-utils';

const AVATARS_DIR = 'avatars';
const SAFE_ID_REGEX = /[^a-zA-Z0-9_-]/g;

function safeFileName(platformId: string): string {
  return platformId.replace(SAFE_ID_REGEX, '_');
}

function extFromContentType(contentType: string | null): string {
  if (!contentType) return '.jpg';
  const lower = contentType.toLowerCase();
  if (lower.includes('png')) return '.png';
  if (lower.includes('webp')) return '.webp';
  if (lower.includes('gif')) return '.gif';
  return '.jpg';
}

/**
 * Скачивает изображение по URL и сохраняет в {DOWNLOAD_PATH}/avatars/channel_{platformId}.{ext}.
 * Возвращает относительный путь (например avatars/channel_UC....jpg) или null при ошибке.
 */
export async function downloadAndSaveChannelAvatar(
  avatarUrl: string,
  platformId: string,
  getDownloadPath: () => Promise<string>
): Promise<string | null> {
  try {
    const res = await fetch(avatarUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type');
    const ext = extFromContentType(contentType);
    const basePath = await getDownloadPath();
    const root = path.isAbsolute(basePath) ? basePath : path.resolve(process.cwd(), basePath);
    const dir = path.join(root, AVATARS_DIR);
    await fs.mkdir(dir, { recursive: true });
    const safeId = safeFileName(platformId);
    const fileName = `channel_${safeId}${ext}`;
    const absolutePath = path.join(dir, fileName);
    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(absolutePath, buffer);
    const relativePath = toRelativeFilePath(absolutePath, root);
    return relativePath.split(path.sep).join('/');
  } catch {
    return null;
  }
}
