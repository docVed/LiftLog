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
