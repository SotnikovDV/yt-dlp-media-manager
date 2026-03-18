import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Форматирует секунды в строку M:SS или H:MM:SS.
 * Формат выбирается автоматически на основе totalDuration (или самого значения seconds).
 */
export function formatVideoTime(seconds: number, totalDuration?: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const ref = totalDuration != null && Number.isFinite(totalDuration) ? totalDuration : seconds;
  const showHours = ref >= 3600;
  if (showHours) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
