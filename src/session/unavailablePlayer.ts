import type { PlayerEngine, PlayerError, PlayerState } from '../domain/types';

/**
 * A player that cannot play, for when the Spotify player script fails to
 * load. Browsing still works; every command is accepted and does nothing,
 * and the state carries the reason for the UI to show.
 */
export function createUnavailablePlayer(error: PlayerError): PlayerEngine {
  const state: PlayerState = {
    status: 'idle',
    track: null,
    positionMs: 0,
    at: 0,
    shuffle: false,
    repeat: 'off',
    volume: 0.8,
    queue: [],
    devices: [],
    error,
  };
  const done = () => Promise.resolve();
  return {
    getState: () => state,
    subscribe: () => () => {},
    play: done,
    toggle: done,
    next: done,
    previous: done,
    seek: done,
    setVolume: done,
    setShuffle: done,
    setRepeat: done,
    enqueue: done,
    refreshDevices: done,
    transfer: done,
    dispose: () => {},
  };
}
