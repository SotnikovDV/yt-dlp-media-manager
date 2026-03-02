import { env } from '@/lib/env';

export function getDownloadPath(): string {
  return env.downloadPath();
}

export async function getDownloadPathAsync(): Promise<string> {
  return env.downloadPath();
}
