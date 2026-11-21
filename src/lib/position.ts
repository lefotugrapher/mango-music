import type { PlayerState } from '../domain/types';

export function positionNow(s: PlayerState, now: number = Date.now()): number {
  if (s.status !== 'playing') return s.positionMs;
  if (!s.track) return 0;
  return Math.min(s.positionMs + (now - s.at), s.track.durationMs);
}
