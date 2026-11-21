import { useEffect, useState } from 'react';
import type { RepeatMode } from '../domain/types';
import { positionNow } from '../lib/position';
import { usePlayer, usePlayerState } from '../session/hooks';

/** The playback position in ms, refreshed while a track is playing. */
export function usePlaybackPosition(): number {
  const state = usePlayerState();
  const [, tick] = useState(0);

  useEffect(() => {
    if (state.status !== 'playing') return;
    // A few updates a second is plenty for a progress bar, and far cheaper
    // than re-rendering on every animation frame.
    const timer = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(timer);
  }, [state.status]);

  return positionNow(state);
}

const NEXT_REPEAT: Record<RepeatMode, RepeatMode> = { off: 'context', context: 'track', track: 'off' };

/** Player state plus the handful of actions every transport UI needs. */
export function useTransport() {
  const player = usePlayer();
  const state = usePlayerState();
  return {
    state,
    hasTrack: state.track != null,
    playing: state.status === 'playing',
    toggle: () => void player.toggle(),
    next: () => void player.next(),
    previous: () => void player.previous(),
    seek: (ms: number) => void player.seek(ms),
    setVolume: (v: number) => void player.setVolume(v),
    toggleShuffle: () => void player.setShuffle(!state.shuffle),
    cycleRepeat: () => void player.setRepeat(NEXT_REPEAT[state.repeat]),
  };
}
