import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const ENV_KEYS = [
  'DOWNLOAD_PATH',
  'DEFAULT_QUALITY',
  'DEFAULT_FORMAT',
  'DEFAULT_SUBSCRIPTION_HISTORY_DAYS',
  'DEFAULT_CHECK_INTERVAL',
  'DEFAULT_PLAYER_MODE',
  'AUTOPLAY_ON_OPEN',
] as const;

function getEnvPath(): string {
  return path.join(process.cwd(), '.env.local');
}

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const eq = trimmed.indexOf('=');
  if (eq < 0) return null;
  const key = trimmed.slice(0, eq).trim();
  const value = trimmed.slice(eq + 1).trim();
  return { key, value };
}

export async function readEnvSettings(): Promise<Record<string, string>> {
  const envPath = getEnvPath();
  let content: string;
  try {
    content = await readFile(envPath, 'utf-8');
  } catch {
    return {};
  }

  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const parsed = parseEnvLine(line);
    if (parsed && ENV_KEYS.includes(parsed.key as any)) {
      result[parsed.key] = parsed.value;
    }
  }
  return result;
}

export async function writeEnvSettings(updates: Record<string, string>): Promise<void> {
  const envPath = getEnvPath();
  let content: string;
  try {
    content = await readFile(envPath, 'utf-8');
  } catch {
    content = '';
  }

  const lines = content.split('\n');
  const updatedKeys = new Set<string>();

  const newLines = lines.map((line) => {
    const parsed = parseEnvLine(line);
    if (parsed && parsed.key in updates) {
      updatedKeys.add(parsed.key);
      return `${parsed.key}=${String(updates[parsed.key]).trim()}`;
    }
    return line;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!updatedKeys.has(key)) {
      newLines.push(`${key}=${String(value).trim()}`);
    }
  }

  await writeFile(envPath, newLines.join('\n') + (content.endsWith('\n') ? '' : '\n'), 'utf-8');
}

export { ENV_KEYS };
