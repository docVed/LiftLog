import { KeiserDisplayFormat } from '@/models/blueprint-models';

export function formatKeiserSeconds(
  totalSeconds: number,
  format: KeiserDisplayFormat,
): string {
  if (format === 'seconds') {
    return `${totalSeconds}s`;
  }
  const negative = totalSeconds < 0;
  const abs = Math.abs(totalSeconds);
  const minutes = Math.floor(abs / 60);
  const seconds = abs % 60;
  const sign = negative ? '-' : '';
  return `${sign}${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Format seconds for editing (no unit suffix; mm:ss or plain seconds). */
export function formatKeiserSecondsForEdit(
  totalSeconds: number,
  format: KeiserDisplayFormat,
): string {
  const abs = Math.max(0, Math.floor(totalSeconds));
  if (format === 'seconds') {
    return `${abs}`;
  }
  const minutes = Math.floor(abs / 60);
  const seconds = abs % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Parse an edited time string back to seconds. Accepts `M:SS`, `MM:SS`, or a
 * plain integer (treated as seconds). Returns `undefined` if the input cannot
 * be interpreted as a non-negative number of seconds.
 */
export function parseKeiserEditedSeconds(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':');
    if (parts.length !== 2) return undefined;
    const minutes = Number(parts[0]);
    const seconds = Number(parts[1]);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds))
      return undefined;
    if (minutes < 0 || seconds < 0 || seconds >= 60) return undefined;
    return Math.floor(minutes) * 60 + Math.floor(seconds);
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
}
