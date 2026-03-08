import path from 'path';
import { existsSync } from 'fs';

export function isStandaloneCwd(cwd = process.cwd()): boolean {
  const n = path.normalize(cwd);
  return path.basename(n) === 'standalone' && path.basename(path.dirname(n)) === '.next';
}

export function getProjectRoot(): string {
  const cwd = process.cwd();
  if (isStandaloneCwd(cwd)) {
    return path.resolve(cwd, '..', '..');
  }
  return cwd;
}

/**
 * Корневая папка для данных (avatars, database и т.д.).
 * В Docker volume монтируется в /data — используем его.
 * Локально — projectRoot/data.
 */
export function getDataRoot(): string {
  if (process.platform !== 'win32' && existsSync('/data')) {
    return '/data';
  }
  return path.join(getProjectRoot(), 'data');
}

