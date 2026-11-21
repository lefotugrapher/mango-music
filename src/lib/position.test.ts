import { describe, expect, it } from 'vitest';
import type { PlayerState, Track } from '../domain/types';
import { positionNow } from './position';

const track = { id: 't', uri: 'demo:track:t', durationMs: 2500 } as Track;
const base: PlayerState = {
  status: 'idle', track, positionMs: 0, at: 0, shuffle: false, repeat: 'off',
  volume: 1, queue: [], devices: [], error: null,
};

describe('positionNow', () => {
  it('advances while playing', () => {
    expect(positionNow({ ...base, status: 'playing', positionMs: 1000, at: 5000 }, 5500)).toBe(1500);
  });
  it('caps at the duration', () => {
    expect(positionNow({ ...base, status: 'playing', positionMs: 1000, at: 5000 }, 7000)).toBe(2500);
  });
  it('holds while paused', () => {
    expect(positionNow({ ...base, status: 'paused', positionMs: 1000, at: 5000 }, 7000)).toBe(1000);
  });
  it('is 0 while playing with no track', () => {
    expect(positionNow({ ...base, status: 'playing', track: null, positionMs: 10, at: 0 }, 99)).toBe(0);
  });
});
